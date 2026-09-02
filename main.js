const { app: electronApp, BrowserWindow, ipcMain,dialog  } = require('electron');
const { autoUpdater } = require('electron-updater');
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const axios = require('axios');
const { getPrinterByName  } = require('@printers/printers');
const sharp = require('sharp');
const log = require('electron-log');



// Logger functions
// --- Configure the Logger ---
// 1. Set the maximum log file size (in bytes). Here it's 5MB. 
// When it hits 5MB, it renames to main.old.log and starts a new one.
log.transports.file.maxSize = 10 * 1024 * 1024;
log.transports.file.resolvePathFn = () => path.join(electronApp.getPath('documents'), 'TheZaffranApp', 'logs', 'application.log');

// 2. Optional: Customize the log message format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 3. Optional: Assign console functions so standard console.log also writes to file
Object.assign(console, log.functions);

function resolveBackendBase() {
  const raw = process.env.BACKEND_URL || readConfiguredBackendUrl();
  // strip trailing slash so URL concatenation (e.g. `${backendBase}/api/...`) never doubles up
  return raw.replace(/\/+$/, '');
}

function readConfiguredBackendUrl() {
  try {

    const config = {
            "development": {
              "backendUrl": "http://localhost:8080"
            },
            "production": {
              "backendUrl": "http://thezaffran.in:8080"
            }
          }
    const env = electronApp.isPackaged ? 'production' : 'development';
    if (config[env]?.backendUrl) {
      return config[env].backendUrl;
    }
  } catch (error) {
    console.warn('Unable to read config.json, falling back to localhost:', error.message);
  }

  return 'http://localhost:8080';
}

const app = express();
const port = process.env.PORT || 3000;
const backendBase = resolveBackendBase();

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

     if (!req.session?.user?.token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const headers = getSessionAuthHeaders(req, {
    'Content-Type': req.headers['content-type'] || 'application/json'
  });

  if (!headers.Authorization) {
    console.warn(`[proxyApi] 403 - no session token for ${req.method} ${req.path}`);
    return res.status(403).json({ message: 'No auth token in session' });
  }

  try {
    const backendUrl = buildBackendUrl(req);
    const backendResponse = await axios({
      method: req.method,
      url: backendUrl,
      params: req.method === 'GET' ? req.query : undefined,
      data: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      validateStatus: () => true,
      headers
    });

    if (backendResponse.status >= 400) {
      console.warn(`[proxyApi] backend ${backendResponse.status} for ${req.method} ${backendUrl}`, backendResponse.data);
    }

    res.status(backendResponse.status).json(backendResponse.data);
  } catch (error) {
    console.error(`[proxyApi] error calling backend for ${req.method} ${req.path}:`, error.message);
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


let mainWindow = null;

function createWindow() {
  console.log('Creating main application window...');
  console.log(path.join(__dirname, 'preload.js'));
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:restaurantos' // ensures cookies persist
    }
  });
  mainWindow = win;
  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });
  win.webContents.once('did-finish-load', async () => {
    const isPreloadLoaded = await win.webContents.executeJavaScript("typeof window.electronAPI === 'object'");
    console.log(`Preload bridge available in renderer: ${isPreloadLoaded}`);
  });
  win.loadURL(`http://localhost:${port}/login`);

}

// Start Express, then Electron
app.listen(port, () => {
  console.log(`Restaurant UI available at http://localhost:${port}`);
  console.log(`Proxying API calls to backend: ${backendBase}`);
  electronApp.whenReady().then(createWindow);
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electronApp.quit();
});

electronApp.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const PRINTER_NAME = "POS80 Printer(3)"; // Replace with your actual printer name

// Lists the OS-registered printer names so PRINTER_NAME can be matched exactly (helps diagnose Bluetooth/offline printers)
ipcMain.handle('list-printers', async () => {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map(p => ({ name: p.name, status: p.status, isDefault: p.isDefault }));
});


async function convertImageToEscPosRaster(imagePath) {
  const absoluteImagePath = path.join(__dirname, 'renderer', 'public', imagePath.replace(/^\/+/, ''));
  const { data, info } = await sharp(absoluteImagePath)
    .resize({ width: 384, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bytesPerRow = Math.ceil(info.width / 8);
  const rasterData = Buffer.alloc(bytesPerRow * info.height);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width) + x] < 160) {
        rasterData[(y * bytesPerRow) + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }

  const header = Buffer.from([
    0x1D, 0x76, 0x30, 0x00,
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
    info.height & 0xFF, (info.height >> 8) & 0xFF
  ]);
  return Buffer.concat([header, rasterData]);
}

async function convertReceiptToBuffer(receipt) {
  const bufferParts = [];

  for (const entry of receipt) {
    if (entry.type === 'raw' && entry.format === 'command') {
      if (Buffer.isBuffer(entry.data)) {
        // Already a Buffer (like ESC_INIT, ALIGN_CENTER, etc.)
        bufferParts.push(entry.data);
      } else if (Array.isArray(entry.data)) {
        bufferParts.push(Buffer.from(entry.data));
      } else if (typeof entry.data === 'string') {
        // Preserve ESC/POS bytes exactly for raw command strings
        bufferParts.push(Buffer.from(entry.data, 'binary'));
      }
    } else if (entry.type === 'raw' && entry.format === 'image' && entry.flavor === 'file' && typeof entry.data === 'string') {
      bufferParts.push(await convertImageToEscPosRaster(entry.data));
    }
  }

  return Buffer.concat(bufferParts);
}



// Listen for a print event from the frontend renderer
ipcMain.on('print-receipt', async (event, data) => {

    console.log('Received print request with data:', data);

  if (!Array.isArray(data) || data.length === 0) {
    event.reply('print-receipt-result', { success: false, message: 'Invalid print payload' });
    return;
  }

  

    try {
        // 2. Fetch the target Windows system printer instance manually
        const printer = await getPrinterByName(PRINTER_NAME);
        
        if (!printer) {
            console.error(`Printer named "${PRINTER_NAME}" was not found on this machine.`);
          event.reply('print-receipt-result', { success: false, message: `Printer not found: ${PRINTER_NAME}` });
            return;
        }

        const finalBuffer = await convertReceiptToBuffer(data);
        const printData = new Uint8Array(finalBuffer);

        console.log(`Dispatching buffer stream to printer queue: ${PRINTER_NAME}...`);
        
        // 8. Execute raw printing task directly via the device API model
        const jobId = await printer.printBytes(printData);
        console.log(`Silent ESC/POS print job created successfully. Windows Job ID: ${jobId}`);
        event.reply('print-receipt-result', { success: true, jobId });

    } catch (error) {
        console.error('Core Windows print spooler process error details:', error);
        event.reply('print-receipt-result', { success: false, message: error.message || 'Print failed' });
    }

});




// Optional: Customize update behavior and notifications
autoUpdater.on('update-available', () => {
  console.log('New version found on server. Downloading in background...');
});

autoUpdater.on('update-downloaded', (info) => {
  // Notify the user that the update is ready
   console.log('Update downloaded successfully.');
  // dialog.showMessageBox({
  //   type: 'info',
  //   title: 'Update Ready',
  //   message: `Version ${info.version} has been downloaded and is ready to install!`,
  //   buttons: ['Restart Now', 'Later']
  // }).then((result) => {
  //   // If they clicked "Restart Now", close app and install
  //   if (result.response === 0) {
  //     autoUpdater.quitAndInstall();
  //   }
  // });
});
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('error', (err) => {
  console.error('Error during update check:', err);
});

// Trigger an initial update check when the app is ready
electronApp.on('ready', () => {
   // 1. Check for updates as soon as the app opens
  autoUpdater.checkForUpdatesAndNotify();
  console.log(`Current app version: ${electronApp.getVersion()}`);
});


// Catch unexpected errors and write them to the file
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception in Main Process:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


ipcMain.handle('get-app-version', () => {
  return electronApp.getVersion(); 
});