const { app: electronApp, BrowserWindow } = require('electron');
const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const backendBase = process.env.BACKEND_URL || 'http://localhost:8080';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'renderer', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'restaurantos-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, 'renderer','public')));
app.use('/css', express.static(path.join(__dirname, 'renderer','css')));
app.use('/js', express.static(path.join(__dirname, 'renderer','js')));
app.use('/images', express.static(path.join(__dirname, 'renderer','images')));
app.use('/fonts', express.static(path.join(__dirname, 'renderer','fonts')));

function getViewContext(req, title) {
  const sessionUser = req.session?.user || null;
  const role = sessionUser?.role || req.query.role || 'Guest';
  const user = sessionUser?.name || req.query.user || 'Guest User';
  const restaurant = normalizeRestaurant(sessionUser?.restaurant) || req.query.restaurant || null;
  const restaurantId = sessionUser?.restaurantId || getRestaurantIdentifier(normalizeRestaurant(sessionUser?.restaurant)) || req.query.restaurantId || null;
  const restaurantList = sessionUser?.restaurantList || [];
  const minDate = new Date().toISOString().split('T')[0];   
  const currentPath = (req.path || '/').replace(/\/$/, '') || '/';
  return { title, role, user, restaurant, restaurantId, restaurantList, minDate, currentPath };
}

function getSessionAuthHeaders(req, extraHeaders = {}) {
  const token = req.session?.user?.token;
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function requireAuth(req, res, next) {
  if (req.session?.user?.token) {
    return next();
  }

  if (req.originalUrl && req.originalUrl !== '/login') {
    req.session.returnTo = req.originalUrl;
  }

  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session?.user?.token) {
    return res.redirect('/dashboard');
  }

  return next();
}

function normalizeRole(roleValue) {
  if (!roleValue) return 'Guest';
  if (typeof roleValue === 'string') return roleValue;
  if (typeof roleValue === 'object') {
    return roleValue.roleName || roleValue.name || 'Guest';
  }
  return 'Guest';
}

function normalizeRestaurant(restaurantValue) {
  if (!restaurantValue) return null;
  if (typeof restaurantValue === 'string') return restaurantValue;
  if (typeof restaurantValue === 'object') {
    // return restaurantValue.name || restaurantValue.restaurantName || null;
    return restaurantValue;
  }
  return null;
}

function getRestaurantIdentifier(restaurantValue) {
  if (!restaurantValue || typeof restaurantValue !== 'object') {
    return null;
  }

  return String(
    restaurantValue.restaurantId
      ?? restaurantValue.id
      ?? restaurantValue.restaurantID
      ?? ''
  ).trim() || null;
}

async function getInventoryForView(req) {
  try {
    const response = await axios.get(`${backendBase}/api/inventory`, {
      headers: getSessionAuthHeaders(req),
      validateStatus: () => true
    });

    if (response.status >= 200 && response.status < 300 && Array.isArray(response.data)) {
      return response.data;
    }

    return [];
  } catch (error) {
    return [];
  }
}

// function buildBackendUrl(reqPath) {
//   if (reqPath === '/api/dashboard') {
//     return `${backendBase}/api/dashboard/summary`;
//   }

//   return `${backendBase}${reqPath}`;
// }

function buildBackendUrl(req) {
  // req.path is the full matched path (e.g. /api/orders/5); the regex route has no capture group
  if (req.path === '/api/dashboard') {
    return `${backendBase}/api/dashboard/summary`;
  }
  return `${backendBase}${req.path}`;
}

async function proxyApi(req, res) {
  const headers = getSessionAuthHeaders(req, {
    'Content-Type': req.headers['content-type'] || 'application/json'
  });

  if (!headers.Authorization) {
    return res.status(403).json({ message: 'No auth token in session' });
  }

  try {
    const backendResponse = await axios({
      method: req.method,
      url: buildBackendUrl(req),
      params: req.method === 'GET' ? req.query : undefined,
      data: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      validateStatus: () => true,
      headers
    });

    res.status(backendResponse.status).json(backendResponse.data);
  } catch (error) {
    res.status(error.response?.status || 502).json(error.response?.data || { message: 'Unable to reach backend service' });
  }
}

// async function proxyApi(req, res) {

//     console.log('Proxying:', req.path, 'Headers:', getSessionAuthHeaders(req));

//   try {
//     const backendResponse = await axios({
//       method: req.method,
//       url: buildBackendUrl(req),
//       params: req.method === 'GET' ? req.query : undefined,
//       data: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
//       validateStatus: () => true,
//       headers: getSessionAuthHeaders(req, {
//         'Content-Type': req.headers['content-type'] || 'application/json'
//       })
//     });

//     res.status(backendResponse.status).json(backendResponse.data);
//   } catch (error) {
//     const statusCode = error.response?.status || 502;
//     const message = error.response?.data || { message: 'Unable to reach backend service' };
//     res.status(statusCode).json(message);
//   }
// }

// app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', redirectIfAuthenticated, (req, res) => res.render('login', { ...getViewContext(req, 'RestaurantOS | Login'), loginError: null }));
app.post('/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${backendBase}/api/auth/login`, {
      email: req.body.email,
      password: req.body.password
    }, {
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json(response.data || { message: 'Invalid credentials' });
    }

    const userData = response.data || {};
    req.session.user = {
      name: userData.name || req.body.email,
      email: req.body.email,
      restaurant: normalizeRestaurant(userData.restaurant),
      restaurantId: getRestaurantIdentifier(normalizeRestaurant(userData.restaurant)),
      role: normalizeRole(userData.role),
      token: userData.token,
      restaurantList: Array.isArray(userData.restaurantAll) ? userData.restaurantAll.map(normalizeRestaurant) : []
    };

    const redirectTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;

    return res.json({
      success: true,
      redirectTo,
      user: {
        name: req.session.user.name,
        email: req.session.user.email,
        role: req.session.user.role,
        restaurant: req.session.user.restaurant
      }
    });
  } catch (error) {
    return res.status(502).json({ message: 'Unable to reach authentication service' });
  }
});

app.post('/session/restaurant', requireAuth, (req, res) => {
  const requestedRestaurantId = String(req.body?.restaurantId || '').trim();
  if (!requestedRestaurantId) {
    return res.status(400).json({ message: 'restaurantId is required' });
  }

  const restaurants = Array.isArray(req.session?.user?.restaurantList)
    ? req.session.user.restaurantList
    : [];

  const selectedRestaurant = restaurants.find(item => getRestaurantIdentifier(item) === requestedRestaurantId);
  if (!selectedRestaurant) {
    return res.status(404).json({ message: 'Restaurant not found for this user' });
  }

  req.session.user.restaurant = normalizeRestaurant(selectedRestaurant);
  req.session.user.restaurantId = getRestaurantIdentifier(selectedRestaurant);

  return req.session.save(saveError => {
    if (saveError) {
      return res.status(500).json({ message: 'Unable to persist session update' });
    }

    return res.json({
      success: true,
      restaurant: req.session.user.restaurant
    });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});
app.get('/dashboard', requireAuth, (req, res) => res.render('dashboard', getViewContext(req, 'Dashboard | RestaurantOS')));
app.get('/menu', requireAuth, (req, res) => res.render('menu', getViewContext(req, 'Menu Management | RestaurantOS')));
app.get('/orders', requireAuth, (req, res) => res.redirect('/orders/open'));
app.get('/orders/open', requireAuth, (req, res) => res.render('orders', getViewContext(req, 'Open Orders | RestaurantOS')));
app.get('/orders/closed', requireAuth, (req, res) => res.render('closed-orders', getViewContext(req, 'Closed Orders | RestaurantOS')));
app.get('/reservations', requireAuth, (req, res) => res.render('reservations', getViewContext(req, 'Reservations | RestaurantOS')));
app.get('/billing', requireAuth, (req, res) => res.render('billing', getViewContext(req, 'Billing | RestaurantOS')));
app.get('/inventory', requireAuth, async (req, res) => {
  const inventory = await getInventoryForView(req);
  res.render('inventory', { ...getViewContext(req, 'Inventory | RestaurantOS'), inventory });
});
app.get('/expenses', requireAuth, (req, res) => res.render('expenses', getViewContext(req, 'Expenses | RestaurantOS')));
app.get('/attendance', requireAuth, (req, res) => res.render('attendance', getViewContext(req, 'Attendance | RestaurantOS')));
app.get('/staff', requireAuth, (req, res) => res.render('staff', getViewContext(req, 'Staff | RestaurantOS')));
app.get('/roles', requireAuth, (req, res) => res.render('roles', getViewContext(req, 'Roles | RestaurantOS')));
app.get('/users', requireAuth, (req, res) => res.render('users', getViewContext(req, 'Users | RestaurantOS')));
app.get('/restaurants', requireAuth, (req, res) => res.render('restaurants', getViewContext(req, 'Restaurants | RestaurantOS')));
app.get('/discounts', requireAuth, (req, res) => res.render('discounts', getViewContext(req, 'Discounts | RestaurantOS')));
app.get('/customers', requireAuth, (req, res) => res.render('customers', getViewContext(req, 'Customers | RestaurantOS')));
app.get('/reports', requireAuth, (req, res) => res.render('reports', getViewContext(req, 'Reports | RestaurantOS')));
app.get('/day-cash', requireAuth, (req, res) => res.render('day-cash', getViewContext(req, 'Day Cash | RestaurantOS')));
app.get('/reportsView', requireAuth, (req, res) => res.render('reports-dashboard', getViewContext(req, 'Reports | RestaurantOS')));
app.get('/reportsView/pnl', requireAuth, (req, res) => res.render('reports-pnl', getViewContext(req, 'P&L Report | RestaurantOS')));
app.get('/reportsView/gst', requireAuth, (req, res) => res.render('reports-gst', getViewContext(req, 'GST Report | RestaurantOS')));
app.get('/reportsView/sales', requireAuth, (req, res) => res.render('reports-sales', getViewContext(req, 'Sales Report | RestaurantOS')));
app.get('/reportsView/inventory', requireAuth, (req, res) => res.render('reports-inventory', getViewContext(req, 'Inventory Report | RestaurantOS')));
app.get('/reportsView/expense', requireAuth, (req, res) => res.render('reports-expense', getViewContext(req, 'Expense Report | RestaurantOS')));
app.get('/reportsView/staff-attendance', requireAuth, (req, res) => res.render('reports-staff-attendance', getViewContext(req, 'Staff Attendance & Salary Report | RestaurantOS')));
app.get('/settings', requireAuth, (req, res) => res.render('settings', getViewContext(req, 'Settings | RestaurantOS')));
app.get('/masterPages', requireAuth, (req, res) => res.render('masterPages', getViewContext(req, 'Master Data Management | RestaurantOS')));
app.get('/orders/new', requireAuth, (req, res) => res.render('new-orders', getViewContext(req, 'New Order | RestaurantOS')));

// Catch-all proxy for API routes
app.all(/^\/api\/.*$/, proxyApi);




app.use((req, res) => {
  res.status(404).render('login', { ...getViewContext(req, 'RestaurantOS | Login'), loginError: null });
});


function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
    //   preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:restaurantos' // ensures cookies persist
    }
  });
  win.loadURL(`http://localhost:${port}`);
}

// Start Express, then Electron
app.listen(port, () => {
  console.log(`Restaurant UI available at http://localhost:${port}`);
  electronApp.whenReady().then(createWindow);
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electronApp.quit();
});

electronApp.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});