// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD3oGsksPcdm8scpptFiFLucTz8ZsUBLQs",
  authDomain: "rsc-approval.firebaseapp.com",
  databaseURL: "https://rsc-approval-default-rtdb.firebaseio.com",
  projectId: "rsc-approval",
  storageBucket: "rsc-approval.appspot.com",
  messagingSenderId: "87805892815",
  appId: "1:87805892815:web:f0ce424ce7ebeef7777fba",
  measurementId: "G-NTFPX8KEX9"
};

// Initialize Firebase (v8/v9-compat namespaced SDK)
firebase.initializeApp(firebaseConfig);

// Auth (Anonymous) so rules with auth can allow writes
firebase.auth().signInAnonymously().catch(err => {
  console.error('Anonymous auth failed:', err);
});

const db = firebase.firestore();
const storage = firebase.storage();
let pendingInvoiceUrl = null; // reserved for future invoice upload

// Admin credentials (note: insecure on client)
const admins = {
  'admin1': { password: 'pass1', name: 'Super Admin' },
  'admin2': { password: 'pass2', name: 'Repair Manager' },
  'admin3': { password: 'pass3', name: 'Approval Specialist' }
};



// Data storage
let repairs = [];
let receivedItems = [];
let committeeApprovals = [];
let customLocations = []; // dynamic locations from DEV.OPTN
let currentUser = null;
let currentSystem = 'repair';
let currentItemContainer = null;

// EDIT MODE state for Committee Approval
let editingApprovalId = null;
let editingApproval = null;

// EDIT MODE state for Repair Editing
let editingRepairDocId = null;

// Filters/state for Previous Approvals
let showAllApprovals = false;
let approvalLocationFilter = '';
let approvalDateSearchTerm = '';

// Login animation data-ready flags
const dataReady = {
  repairs: false,
  received: false,
  approvals: false,
  locations: false
};

// ===== Utility: simple HTML escape for safe innerHTML insertions =====
function e(v) {
  return String(v == null ? '' : v).replace(/[&<>"'`=\/]/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;','/':'&#47;'}[s])
  );
}

// ===== Static sections and cost centers (baseline) =====
const staticRegionSections = {
  'Central East': ['Manager Office East', 'Ampitiya', 'Madadumbara', 'Pallekale', 'Workshop',
    'Marassana', 'Haragama', 'Rikillagaskada', 'Walapane', 'Ragala', 'Thannekumbura'],
  'Central North': ['Matale DE', 'Matale WSS', 'Pusella WSS', 'Udathanna WSS', 'Raththota WSS',
    'Abangaga WSS', 'Naula WSS', 'Wilgamuwa WSS', 'Dambulla WSS', 'Galewela WSS',
    'Manager Office North', 'Pathadumbara WSS', 'Harispaththuwa WSS', 'Galagedara WSS',
    'Minigamuwa WSS', 'Akurana WSS', 'Hadeniya WSS', 'Bokkawala WSS', 'Galhinna',
    'Ankumbura WSS', 'Greater Kandy WTP', 'RSC', 'RWSS', 'PROJECT ENGINEER MANAGER',
    'WATER SAFETY PLAN'],
  'Central South': ['Manager Office South', 'Hanthana', 'Laboratory', 'Udu Yatinuwara', 'University',
    'Gampola', 'Nawalapitiya', 'Welamboda', 'Hatton', 'Nuawaraeliya Circuit Bungalow',
    'Pudaluoya', 'Ginigathhena', 'Siripada Nallathanniya', 'Maskeliya', 'Thalawakale'],
  'Matale': ['Matale', 'Raththota', 'Pussella', 'Ukuwela', 'Dambulla',
    'Naula', 'Ambanganga', 'Galewela']
};

const sectionCostCenters = {
  'Manager Office East': '4100',
  'Ampitiya': '4103',
  'Madadumbara': '4127',
  'Pallekale': '4138',
  'Workshop': '4144',
  'Marassana': '4160',
  'Haragama': '4166',
  'Rikillagaskada': '4167',
  'Walapane': '4168',
  'Ragala': '4169',
  'Thannekumbura': '4170',
  'Matale DE': '4332',
  'Matale WSS': '4331',
  'Pusella WSS': '4341',
  'Udathanna WSS': '4346',
  'Raththota WSS': '4366',
  'Abangaga WSS': '4365',
  'Naula WSS': '4337',
  'Wilgamuwa WSS': '4347',
  'Dambulla WSS': '4308',
  'Galewela WSS': '4348',
  'Manager Office North': '4300',
  'Pathadumbara WSS': '4339',
  'Harispaththuwa WSS': '4312',
  'Galagedara WSS': '4310',
  'Minigamuwa WSS': '4310',
  'Akurana WSS': '4301',
  'Hadeniya WSS': '4316',
  'Bokkawala WSS': '4316',
  'Galhinna': '4316',
  'Ankumbura WSS': '4304',
  'Greater Kandy WTP': '4364',
  'RSC': '4000',
  'RWSS': '4002',
  'PROJECT ENGINEER MANAGER': '4005',
  'WATER SAFETY PLAN': '4006',
  'Manager Office Souths': '4200', // normalized below
  'Hanthana': '4213',
  'Laboratory': '4226',
  'Udu Yatinuwara': '4245',
  'University': '4248',
  'Gampola': '4251',
  'Nawalapitiya': '4265',
  'Welamboda': '4266',
  'Hatton': '4271',
  'Mee': '4271', // stray, removed below
  'Nuawaraeliya Circuit Bungalow': '4272',
  'Pudaluoya': '4273',
  'Ginigathhena': '4274',
  'Siripada Nallathanniya': '4275',
  'Maskeliya': '4276',
  'Thalawakale': '4277'
};

// Normalize known typos/strays
(function normalizeCostCenters() {
  if (sectionCostCenters['Manager Office Souths']) {
    sectionCostCenters['Manager Office South'] = sectionCostCenters['Manager Office Souths'];
    delete sectionCostCenters['Manager Office Souths'];
  }
  if (sectionCostCenters['Mee'] === '4271') {
    delete sectionCostCenters['Mee'];
  }
})();

// ===== Dynamic locations (from DEV.OPTN) =====
let dynamicRegionSections = {}; // { region: [sections] }
let dynamicSectionCostCenters = {}; // { section: costCenter }

function rebuildDynamicLocationMaps() {
  dynamicRegionSections = {};
  dynamicSectionCostCenters = {};
  for (const loc of customLocations) {
    const region = (loc.region || '').trim();
    const section = (loc.section || '').trim();
    const cc = (loc.costCenter || '').trim();
    if (!region || !section) continue;
    if (!dynamicRegionSections[region]) dynamicRegionSections[region] = [];
    if (!dynamicRegionSections[region].includes(section)) dynamicRegionSections[region].push(section);
    dynamicSectionCostCenters[section] = cc;
  }
}

function sectionsFor(region) {
  const base = staticRegionSections[region] || [];
  const dyn = dynamicRegionSections[region] || [];
  return Array.from(new Set([...base, ...dyn])).sort((a, b) => a.localeCompare(b));
}

function getAllRegions() {
  const base = Object.keys(staticRegionSections);
  const dyn = Object.keys(dynamicRegionSections);
  return Array.from(new Set([...base, ...dyn])).sort((a, b) => a.localeCompare(b));
}

function getCostCenterForSection(section) {
  if (!section) return '';
  return dynamicSectionCostCenters[section] || sectionCostCenters[section] || '';
}

// Load data from Firestore
function loadData() {
  db.collection("repairs").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    if (!dataReady.repairs) dataReady.repairs = true;
    repairs = [];
    snapshot.forEach((doc) => {
      repairs.push({ id: doc.id, ...doc.data() });
    });
    populateUpcomingReturns();
    populateAllRepairs();
    populateJobCardList();
    populateApprovalJobCardOptions(); // refresh job card multi-select
  }, err => console.error('repairs listener failed:', err));

  db.collection("receivedItems").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    if (!dataReady.received) dataReady.received = true;
    receivedItems = [];
    snapshot.forEach((doc) => {
      receivedItems.push({ id: doc.id, ...doc.data() });
    });
    populateReceivedItems();
  }, err => console.error('receivedItems listener failed:', err));

  db.collection("committeeApprovals").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    if (!dataReady.approvals) dataReady.approvals = true;
    committeeApprovals = [];
    snapshot.forEach((doc) => {
      committeeApprovals.push({ id: doc.id, ...doc.data() });
    });
    populatePreviousApprovals();
  }, err => console.error('committeeApprovals listener failed:', err));

  // Custom Locations (DEV.OPTN)
  db.collection("customLocations").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    if (!dataReady.locations) dataReady.locations = true;
    customLocations = [];
    snapshot.forEach(doc => customLocations.push({ id: doc.id, ...doc.data() }));
    rebuildDynamicLocationMaps();
    populateRegionSelects();
    populateApprovalLocationOptions();
    renderCustomLocationsList();
    // If a region is already selected, refresh dependent dropdowns
    const rr = document.getElementById('repairRegion');
    if (rr && rr.value) updateDistricts.call(rr);
    const nir = document.getElementById('newItemRegion');
    if (nir && nir.value) updateSections();
  }, err => console.error('customLocations listener failed:', err));
}

// DOM Ready
document.addEventListener('DOMContentLoaded', function () {
  // Init data listeners
  loadData();

  // Sidebar init
  initSidebarNav();

  // Ensure a job number is present on load
  const jobNoInput = document.getElementById('repairJobNumber');
  if (jobNoInput && !jobNoInput.value) generateJobNumber();

  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      handleLogin();
    });
  }

  // Password toggle
  const togglePw = document.getElementById('togglePassword');
  if (togglePw) {
    togglePw.addEventListener('click', function (e) {
      e.preventDefault();
      const passwordInput = document.getElementById('password');
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.querySelector('i').classList.toggle('fa-eye-slash');
      this.querySelector('i').classList.toggle('fa-eye');
    });
  }

  // Populate regions initially (will update when custom locations arrive)
  populateRegionSelects();

  // Repair region -> Offices
  const repairRegionEl = document.getElementById('repairRegion');
  if (repairRegionEl) {
    repairRegionEl.addEventListener('change', updateDistricts);
  }

  // EDIT modal: region -> Offices
  const editRepairRegionEl = document.getElementById('editRepairRegion');
  if (editRepairRegionEl) {
    editRepairRegionEl.addEventListener('change', () => updateEditDistricts());
  }

  // Add item button
  const addItemBtn = document.getElementById('addItemBtn');
  if (addItemBtn) addItemBtn.addEventListener('click', addAdditionalItem);

  // Repair item "Other" textbox toggler (main and any existing selects)
  bindRepairItemSelectToggles();

  // Received items modal search
  const rimSearchBtn = document.getElementById('receivedItemsModalSearchBtn');
  if (rimSearchBtn) rimSearchBtn.addEventListener('click', searchReceivedItemsModal);

  const rimSearchInput = document.getElementById('receivedItemsModalSearch');
  if (rimSearchInput) {
    rimSearchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchReceivedItemsModal();
    });
  }

  // Dates
  setDefaultDates();

  // Init main item checkbox total calc
  initializeItemReceivedCheckboxes();

  // Repair form submission
  const repairForm = document.getElementById('repairForm');
  if (repairForm) {
    repairForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!repairForm.reportValidity()) return;
      const jobNoInput = document.getElementById('repairJobNumber');
      if (jobNoInput && !jobNoInput.value) generateJobNumber();
      addNewRepair(); // async function
    });
  }

  // Received item form submission
  const receivedItemForm = document.getElementById('receivedItemForm');
  if (receivedItemForm) {
    receivedItemForm.addEventListener('submit', function (e) {
      e.preventDefault();
      addReceivedItem();
    });
  }

  // Received item name change (toggle "Other" + storage field)
  const receivedItemName = document.getElementById('receivedItemName');
  if (receivedItemName) {
    receivedItemName.addEventListener('change', function () {
      const otherInput = document.getElementById('otherItemInput');
      if (otherInput) otherInput.style.display = this.value === 'other' ? 'block' : 'none';

      const storageField = document.getElementById('storageCapacityField');
      const storageItems = ['ram', 'hard disk', 'ssd'];
      if (storageField) storageField.style.display = storageItems.includes(this.value) ? 'block' : 'none';
    });
  }

  // Quantity change for received items (form)
  const receivedItemQuantity = document.getElementById('receivedItemQuantity');
  if (receivedItemQuantity) {
    receivedItemQuantity.addEventListener('change', updateSerialNumberInputs);
    receivedItemQuantity.addEventListener('input', function () {
      const quantity = parseInt(this.value) || 1;
      const serialContainer = document.getElementById('serialNumbersContainer');
      if (serialContainer) serialContainer.style.display = quantity > 1 ? 'block' : 'none';
    });
  }

  // Received items search
  const receivedItemsSearchBtn = document.getElementById('receivedItemsSearchBtn');
  if (receivedItemsSearchBtn) receivedItemsSearchBtn.addEventListener('click', searchReceivedItems);

  // Committee approval form submission
  const committeeForm = document.getElementById('committeeForm');
  if (committeeForm) {
    committeeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      addCommitteeApproval();
    });

    // If user clicks reset, exit edit mode and clear rows
    committeeForm.addEventListener('reset', function () {
      setTimeout(() => cancelEditApproval(), 0);
    });
  }

  // Add approval item
  const addApprovalItemBtn = document.getElementById('addApprovalItemBtn');
  if (addApprovalItemBtn) addApprovalItemBtn.addEventListener('click', addApprovalItem);

  // Print approval
  const printApprovalBtn = document.getElementById('printApprovalBtn');
  if (printApprovalBtn) printApprovalBtn.addEventListener('click', function () {
    printCommitteeApproval();
  });

  // Approval search (Date)
  const approvalSearchBtn = document.getElementById('approvalSearchBtn');
  if (approvalSearchBtn) approvalSearchBtn.addEventListener('click', searchApprovals);
  const approvalSearchInput = document.getElementById('approvalSearch');
  if (approvalSearchInput) {
    approvalSearchInput.placeholder = '0000-00-00';
    approvalSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchApprovals(); });
  }

  // Toggle "Other Chairman Name" visibility
  const chairmanSelect = document.getElementById('chairmanName');
  if (chairmanSelect) {
    chairmanSelect.addEventListener('change', toggleOtherChairmanField);
    toggleOtherChairmanField();
  }

  // Committee approval region change
  const newItemRegion = document.getElementById('newItemRegion');
  if (newItemRegion) newItemRegion.addEventListener('change', updateSections);

  // Committee approval section change - auto-fill cost center (dynamic + static)
  const newItemSection = document.getElementById('newItemSection');
  if (newItemSection) {
    newItemSection.addEventListener('change', function () {
      const selectedSection = this.value;
      document.getElementById('newItemCostCenter').value = getCostCenterForSection(selectedSection) || '';
    });
  }

  // Serial number search (legacy)
  const serialSearchBtn = document.getElementById('serialSearchBtn');
  if (serialSearchBtn) serialSearchBtn.addEventListener('click', searchBySerialNumber);
  const serialNumberSearch = document.getElementById('serialNumberSearch');
  if (serialNumberSearch) {
    serialNumberSearch.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchBySerialNumber();
    });
  }

  // System Tracking search
  const systemTrackingSearchBtn = document.getElementById('systemTrackingSearchBtn');
  if (systemTrackingSearchBtn) systemTrackingSearchBtn.addEventListener('click', searchSystemTracking);
  const systemTrackingSearch = document.getElementById('systemTrackingSearch');
  if (systemTrackingSearch) {
    systemTrackingSearch.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchSystemTracking();
    });
  }

  // File Tracking modal events
  const ftModalEl = document.getElementById('fileTrackingModal');
  if (ftModalEl) {
    ftModalEl.addEventListener('shown.bs.modal', renderFileTrackingStats);
    const ftSearchBtn = document.getElementById('fileTrackingSearchBtn');
    const ftInput = document.getElementById('fileTrackingSearchInput');
    if (ftSearchBtn) ftSearchBtn.addEventListener('click', searchFileTracking);
    if (ftInput) ftInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchFileTracking(); });
  }

  // Job Card History search listeners
  const jcSearchBtn = document.getElementById('jobCardSearchBtn');
  const jcSearchInput = document.getElementById('jobCardSearchInput');
  if (jcSearchBtn) jcSearchBtn.addEventListener('click', searchJobCardsByNumber);
  if (jcSearchInput) jcSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchJobCardsByNumber(); });

  // Build the location filter dropdown for Previous Approvals
  populateApprovalLocationOptions();

  // Toggle "View All" / "Show Latest 5"
  const toggleBtn = document.getElementById('toggleApprovalsViewBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      showAllApprovals = !showAllApprovals;
      populatePreviousApprovals();
    });
  }

  // Location filter change
  const locFilter = document.getElementById('approvalLocationFilter');
  if (locFilter) {
    locFilter.addEventListener('change', function () {
      approvalLocationFilter = this.value || '';
      populatePreviousApprovals();
    });
  }

  // DEV.OPTN form
  const customLocForm = document.getElementById('customLocationForm');
  if (customLocForm) {
    customLocForm.addEventListener('submit', function (e) {
      e.preventDefault();
      addCustomLocation();
    });
  }

  // Initialize approval table header visibility
  toggleApprovalTableHeader();

  // Initial load of the job card options (if on page already)
  populateApprovalJobCardOptions();

  // Edit Repair: Save
  const editRepairSaveBtn = document.getElementById('editRepairSaveBtn');
  if (editRepairSaveBtn) {
    editRepairSaveBtn.addEventListener('click', saveEditedRepair);
  }

  // Edit Repair: Add item
  const editAddItemBtn = document.getElementById('editAddItemBtn');
  if (editAddItemBtn) {
    editAddItemBtn.addEventListener('click', () => addEditItem());
  }
});

// Helpers
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Safely read value from table cell
function getCellValue(cell) {
  if (!cell) return '';
  const ctl = cell.querySelector('input, textarea, select');
  if (ctl) {
    if (ctl.tagName === 'SELECT') {
      return ctl.options[ctl.selectedIndex]?.text || ctl.value || '';
    }
    return ctl.value || '';
  }
  return (cell.textContent || '').trim();
}

function generateJobNumber() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const jobNumber = `RSC/${year}/${randomNum}`;
  const input = document.getElementById('repairJobNumber');
  if (input) input.value = jobNumber;
  return jobNumber;
}

// Ensure job number uniqueness in Firestore (used by the refresh button)
async function reserveUniqueJobNumber() {
  const input = document.getElementById('repairJobNumber');
  if (!input) return null;

  let tries = 0;
  while (tries < 6) {
    const candidate = generateJobNumber();
    const snap = await db.collection('repairs')
      .where('jobNumber', '==', candidate)
      .limit(1)
      .get();
    if (snap.empty) {
      input.value = candidate;
      return candidate;
    }
    tries++;
  }
  alert('Could not generate a unique job number. Please try again.');
  return null;
}

function parseNumber(val) {
  if (val == null) return 0;
  const cleaned = String(val).replace(/[^0-9.\-]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num ? num : Number(cleaned)) ? 0 : (isNaN(num) ? 0 : num); // ensure
}

function formatMoney(val) {
  const n = parseNumber(val);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Group items for printing
function groupItemsForRowspan(items) {
  const map = new Map();
  (items || []).forEach(it => {
    const region = (it.region || '').trim();
    const section = (it.section || '').trim();
    const costCenter = (it.costCenter || '').trim();
    const key = `${region}||${section}||${costCenter}`;
    const row = {
      description: (it.description || '').trim(),
      qty: parseNumber(it.qty),
      unitRate: parseNumber(it.unitRate),
      amount: parseNumber(it.amount) || (parseNumber(it.qty) * parseNumber(it.unitRate))
    };
    if (!map.has(key)) {
      map.set(key, { region, section, costCenter, rows: [row] });
    } else {
      map.get(key).rows.push(row);
    }
  });
  return Array.from(map.values());
}

// Search by Serial Number (legacy UI)
function searchBySerialNumber() {
  const inputEl = document.getElementById('serialNumberSearch');
  const searchTerm = (inputEl?.value || '').trim();
  if (!searchTerm) {
    alert('Please enter a serial number to search');
    return;
  }
  const sLower = searchTerm.toLowerCase();

  // Prefer latest repair
  let matched = null;
  for (const repair of repairs) {
    if (!repair?.items) continue;
    const item = repair.items.find(it => it.newSerial && String(it.newSerial).toLowerCase() === sLower);
    if (item) {
      matched = { repair, item };
      break;
    }
  }

  const resultsDiv = document.getElementById('serialSearchResults');

  if (matched) {
    const { item } = matched;
    setText('serialItemName', (item.itemName || item.itemReplaced || 'Item') + (item.capacity ? ` (${item.capacity}GB)` : ''));
    setText('serialNumber', item.newSerial || searchTerm);
    setText('serialInvoice', item.invoiceNumber || 'N/A');
    setText('serialWarranty', (item.warrantyPeriod != null ? item.warrantyPeriod : 'N/A'));
    setText('serialSupplier', item.supplier || 'N/A');
    setText('serialPrice', Number(item.unitPrice || 0).toFixed(2));

    if (resultsDiv) resultsDiv.style.display = 'block';
    return;
  }

  // Fallback to inventory
  let foundItem = null;
  let foundSerial = null;
  for (const item of receivedItems) {
    if (item.serialNumbers && item.serialNumbers.length > 0) {
      const matchingSerial = item.serialNumbers.find(serial => String(serial).toLowerCase() === sLower);
      if (matchingSerial) {
        foundItem = item;
        foundSerial = matchingSerial;
        break;
      }
    } else if (item.newSerial && String(item.newSerial).toLowerCase() === sLower) {
      foundItem = item;
      foundSerial = item.newSerial;
      break;
    }
  }

  if (foundItem) {
    setText('serialItemName', foundItem.itemName + (foundItem.capacity ? ` (${foundItem.capacity}GB)` : ''));
    setText('serialNumber', foundSerial || searchTerm);
    setText('serialInvoice', foundItem.invoiceNumber || 'N/A');
    setText('serialWarranty', (foundItem.warrantyPeriod != null ? foundItem.warrantyPeriod : 'N/A'));
    setText('serialSupplier', foundItem.supplier || 'N/A');
    setText('serialPrice', Number(foundItem.unitPrice || 0).toFixed(2));

    const resultsDiv2 = document.getElementById('serialSearchResults');
    if (resultsDiv2) resultsDiv2.style.display = 'block';
  } else {
    const resultsDiv2 = document.getElementById('serialSearchResults');
    if (resultsDiv2) resultsDiv2.style.display = 'none';
    alert('Serial number not found.');
  }
}

function addSerialNumberField() {
  const container = document.getElementById('additionalSerialNumbers');
  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group mb-2 serial-number-input';
  inputGroup.innerHTML = `
    <input type="text" class="form-control" placeholder="Serial Number" required>
    <button class="btn btn-outline-danger" type="button" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  container.appendChild(inputGroup);
}

function updateSerialNumberInputs() {
  const qtyEl = document.getElementById('receivedItemQuantity');
  const quantity = parseInt(qtyEl?.value) || 1;
  const container = document.getElementById('additionalSerialNumbers');
  const serialContainer = document.getElementById('serialNumbersContainer');

  if (container) container.innerHTML = '';

  if (quantity > 1) {
    if (serialContainer) serialContainer.style.display = 'block';
    for (let i = 1; i < quantity; i++) addSerialNumberField();
  } else {
    if (serialContainer) serialContainer.style.display = 'none';
  }
}

function populateRegionSelects() {
  const regions = getAllRegions();
  // Repair Region
  const repairRegion = document.getElementById('repairRegion');
  if (repairRegion) {
    const prev = repairRegion.value;
    repairRegion.innerHTML = '<option value="" selected disabled>Select Region</option>';
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      repairRegion.appendChild(opt);
    });
    if (prev && regions.includes(prev)) repairRegion.value = prev;
  }
  // Committee Region
  const newItemRegion = document.getElementById('newItemRegion');
  if (newItemRegion) {
    const prev = newItemRegion.value;
    newItemRegion.innerHTML = '<option value="" selected disabled>Select Region</option>';
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      newItemRegion.appendChild(opt);
    });
    if (prev && regions.includes(prev)) newItemRegion.value = prev;
  }
  // Edit Repair Region
  const editRegion = document.getElementById('editRepairRegion');
  if (editRegion) {
    const prev = editRegion.value;
    editRegion.innerHTML = '<option value="" disabled>Select Region</option>';
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      editRegion.appendChild(opt);
    });
    if (prev && regions.includes(prev)) editRegion.value = prev;
  }
  // DEV datalist
  populateRegionDatalist();
}

function populateRegionDatalist() {
  const dl = document.getElementById('regionDatalist');
  if (!dl) return;
  dl.innerHTML = '';
  getAllRegions().forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    dl.appendChild(opt);
  });
}

// Update Offices (Repair page) based on region
function updateDistricts() {
  const region = this.value;
  const districtSelect = document.getElementById('repairDistrict');
  districtSelect.innerHTML = '<option value="" selected disabled>Select Office</option>';
  districtSelect.disabled = !region;
  if (!region) return;
  sectionsFor(region).forEach(section => {
    const option = document.createElement('option');
    option.value = section;
    option.textContent = section;
    districtSelect.appendChild(option);
  });
}

// Edit modal: update Offices based on region
function updateEditDistricts(preselect = null) {
  const regionEl = document.getElementById('editRepairRegion');
  const districtSelect = document.getElementById('editRepairDistrict');
  const region = regionEl?.value || '';
  districtSelect.innerHTML = '<option value="" selected disabled>Select Office</option>';
  districtSelect.disabled = !region;
  if (!region) return;
  const secs = sectionsFor(region);
  secs.forEach(section => {
    const option = document.createElement('option');
    option.value = section;
    option.textContent = section;
    districtSelect.appendChild(option);
  });
  if (preselect && secs.includes(preselect)) {
    districtSelect.value = preselect;
  }
}

// Committee page: update Sections based on region
function updateSections() {
  const region = document.getElementById('newItemRegion').value;
  const sectionSelect = document.getElementById('newItemSection');

  sectionSelect.innerHTML = '<option value="" selected disabled>Select Section</option>';
  sectionSelect.disabled = !region;

  if (!region) return;

  sectionsFor(region).forEach(section => {
    const option = document.createElement('option');
    option.value = section;
    option.textContent = section;
    sectionSelect.appendChild(option);
  });
}

// Received Items modal/population/search/select
function showReceivedItemsModal(button) {
  currentItemContainer = button.closest('.row').parentElement;
  populateReceivedItemsModal();
  const modal = new bootstrap.Modal(document.getElementById('receivedItemsModal'));
  modal.show();
}

function populateReceivedItemsModal() {
  const tableBody = document.getElementById('receivedItemsModalTable');
  tableBody.innerHTML = '';

  receivedItems.forEach(item => {
    const row = document.createElement('tr');
    const name = e(item.itemName) + (item.capacity ? ` (${e(item.capacity)}GB)` : '');
    const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map(e).join(', ') : e(item.newSerial || '');
    row.innerHTML = `
      <td>${name}</td>
      <td>${serials}</td>
      <td>${e(item.invoiceNumber || '')}</td>
      <td>${e(item.fileNumber || '')}</td>
      <td>${e(item.poNumber || '')}</td>
      <td>${Number(item.unitPrice || 0).toFixed(2)}</td>
      <td>${e(item.quantity || 0)}</td>
      <td>${e(item.warrantyPeriod || '')} months</td>
      <td>${e(item.supplier || '')}</td>
    `;
    row.addEventListener('click', function () {
      selectReceivedItem(item);
      const modal = bootstrap.Modal.getInstance(document.getElementById('receivedItemsModal'));
      modal.hide();
    });
    tableBody.appendChild(row);
  });
}

function searchReceivedItemsModal() {
  const searchTerm = (document.getElementById('receivedItemsModalSearch').value || '').toLowerCase();
  const rows = document.querySelectorAll('#receivedItemsModalTable tr');

  rows.forEach(row => {
    const itemName = row.cells[0].textContent.toLowerCase();
    const serial = row.cells[1].textContent.toLowerCase();
    row.style.display = (itemName.includes(searchTerm) || serial.includes(searchTerm)) ? '' : 'none';
  });
}

function selectReceivedItem(item) {
  if (!currentItemContainer) return;

  // Match item dropdown
  const itemSelect = currentItemContainer.querySelector('.repair-item-select');
  if (itemSelect) {
    const itemName = (item.itemName || '').toLowerCase();
    const options = Array.from(itemSelect.options);
    const matchingOption = options.find(option => option.value === itemName);

    if (matchingOption) {
      itemSelect.value = itemName;
    } else {
      itemSelect.value = 'other';
      const otherInputWrap = currentItemContainer.querySelector('.repair-other-item-input');
      const otherInput = otherInputWrap?.querySelector('input');
      if (otherInput) {
        otherInput.value = item.itemName || '';
        otherInputWrap.style.display = 'block';
      }
    }
    itemSelect.dispatchEvent(new Event('change'));
  }

  // Serial numbers
  const serialSelect = currentItemContainer.querySelector('.repair-new-serial');
  serialSelect.innerHTML = '';

  if (item.serialNumbers && item.serialNumbers.length > 0) {
    item.serialNumbers.forEach(serial => {
      const option = document.createElement('option');
      option.value = serial;
      option.textContent = serial;
      serialSelect.appendChild(option);
    });
  } else {
    const option = document.createElement('option');
    option.value = item.newSerial || '';
    option.textContent = item.newSerial || '';
    serialSelect.appendChild(option);
  }

  currentItemContainer.querySelector('.repair-unit-price').value = item.unitPrice || 0;
  currentItemContainer.querySelector('.repair-quantity').value = 1;
  currentItemContainer.querySelector('.repair-total-price').value = Number(item.unitPrice || 0).toFixed(2);

  const checkbox = currentItemContainer.querySelector('.item-received-check');
  if (checkbox) {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
  }
}

// Update inventory item (remove selected serial / reduce qty) - safer transaction
function updateReceivedItemQuantity(itemId, quantityUsed, selectedSerial) {
  const ref = db.collection("receivedItems").doc(itemId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();

    const qUsed = Math.max(1, quantityUsed || 1);

    if (Array.isArray(data.serialNumbers) && data.serialNumbers.length > 0) {
      if (!selectedSerial) throw new Error('Serial required for serial-tracked item');
      if (!data.serialNumbers.includes(selectedSerial)) throw new Error('Serial not found in inventory');

      const currentQty = Number(data.quantity ?? data.serialNumbers.length);
      const newQty = Math.max(0, currentQty - qUsed);
      const remaining = data.serialNumbers.filter(sn => sn !== selectedSerial);

      if (remaining.length === 0 || newQty <= 0) {
        tx.delete(ref);
      } else {
        tx.update(ref, { serialNumbers: remaining, quantity: newQty });
      }
    } else {
      const newQty = Math.max(0, (Number(data.quantity) || 1) - qUsed);
      if (newQty <= 0) {
        tx.delete(ref);
      } else {
        tx.update(ref, { quantity: newQty });
      }
    }
  }).catch(err => {
    console.error('Inventory update failed:', err);
    alert('Inventory update failed. Please retry.');
  });
}

function addAdditionalItem() {
  const container = document.getElementById('additionalItemsContainer');
  const itemCount = container.querySelectorAll('.additional-item').length + 1;
  const itemId = Date.now();

  const itemHTML = `
    <div class="additional-item" id="item-${itemId}">
      <div class="additional-item-header" onclick="toggleAdditionalItem('item-${itemId}')">
        <h6>Additional Item #${itemCount}</h6>
        <div>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAdditionalItem('item-${itemId}', event)">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="additional-item-content">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Item Replaced</label>
            <select class="form-select repair-item-select">
              <option value="" selected disabled>Select Item</option>
              <option value="ram">RAM</option>
              <option value="hard disk">Hard Disk</option>
              <option value="ssd">SSD</option>
              <option value="motherboard">Motherboard</option>
              <option value="battery">Battery</option>
              <option value="power supply">Power Supply</option>
              <option value="graphic card">Graphic Card</option>
              <option value="other">Other</option>
            </select>
            <div class="repair-other-item-input mt-2" style="display: none;">
              <input type="text" class="form-control" placeholder="Enter item name">
            </div>
            <button type="button" class="btn btn-sm btn-link mt-1" onclick="showReceivedItemsModal(this)">
              <i class="fas fa-search me-1"></i> Select from received items
            </button>
          </div>
          <div class="col-md-6">
            <div class="form-check mb-3">
              <input class="form-check-input item-received-check" type="checkbox">
              <label class="form-check-label">Item has been received</label>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">New Serial Number</label>
            <select class="form-select repair-new-serial" disabled>
              <option value="" selected disabled>Select Serial Number</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">Old Serial Number</label>
            <input type="text" class="form-control repair-old-serial">
          </div>
          <div class="col-md-6">
            <label class="form-label">Unit Price (Rs)</label>
            <input type="number" class="form-control repair-unit-price" min="0" step="0.01" disabled>
          </div>
          <div class="col-md-6">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-control repair-quantity" min="1" value="1" disabled>
          </div>
          <div class="col-md-6">
            <label class="form-label">Total Price (Rs)</label>
            <input type="text" class="form-control repair-total-price" readonly>
          </div>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', itemHTML);

  const newItem = document.getElementById(`item-${itemId}`);

  // Bind toggler for "Other"
  bindRepairItemSelectToggles(newItem);

  // Checkbox enable/disable logic
  newItem.querySelector('.item-received-check').addEventListener('change', function () {
    const isChecked = this.checked;
    const content = this.closest('.additional-item-content');
    content.querySelector('.repair-new-serial').disabled = !isChecked;
    content.querySelector('.repair-unit-price').disabled = !isChecked;
    content.querySelector('.repair-quantity').disabled = !isChecked;

    content.querySelector('.repair-total-price').removeAttribute('disabled');

    if (!isChecked) {
      content.querySelector('.repair-new-serial').value = '';
      content.querySelector('.repair-unit-price').value = '';
      content.querySelector('.repair-quantity').value = '1';
      content.querySelector('.repair-total-price').value = '';
    }
  });

  newItem.querySelector('.repair-unit-price').addEventListener('input', function () {
    calculateRepairTotal(this);
  });

  newItem.querySelector('.repair-quantity').addEventListener('input', function () {
    calculateRepairTotal(this);
  });

  newItem.classList.add('active');
}

function toggleAdditionalItem(itemId) {
  const item = document.getElementById(itemId);
  item.classList.toggle('active');
}

function removeAdditionalItem(itemId, event) {
  event.stopPropagation();
  const item = document.getElementById(itemId);
  item.remove();

  const container = document.getElementById('additionalItemsContainer');
  const items = container.querySelectorAll('.additional-item');
  items.forEach((it, index) => {
    const header = it.querySelector('.additional-item-header h6');
    header.textContent = header.textContent.replace(/#\d+/, `#${index + 1}`);
  });
}

function populateReceivedItems() {
  const tableBody = document.getElementById('receivedItemsTable');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  receivedItems.forEach(item => {
    const row = document.createElement('tr');
    const serialOptions = item.serialNumbers
      ? item.serialNumbers.map(sn => `<option value="${e(sn)}">${e(sn)}</option>`).join('')
      : `<option value="${e(item.newSerial || '')}">${e(item.newSerial || '')}</option>`;

    row.innerHTML = `
      <td>${e(item.itemName)}${item.capacity ? ` (${e(item.capacity)}GB)` : ''}</td>
      <td>
        <select class="form-select serial-number-select" onchange="updateSelectedSerial(this, '${e(item.id)}')">
          ${serialOptions}
        </select>
      </td>
      <td>
        ${e(item.invoiceNumber || '')}
        ${item.invoiceUrl ? ` <a href="${e(item.invoiceUrl)}" target="_blank" rel="noopener" class="ms-1">View</a>` : ''}
      </td>
      <td>${e(item.fileNumber || '')}</td>
      <td>${e(item.poNumber || '')}</td>
      <td>${e(item.warrantyPeriod || '')} months</td>
      <td>${Number(item.unitPrice || 0).toFixed(2)}</td>
      <td>${e(item.quantity || 0)}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger" onclick="removeReceivedItem('${e(item.id)}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateSelectedSerial(select, itemId) {
  const item = receivedItems.find(item => item.id === itemId);
  if (item) item.selectedSerial = select.value;
}

function removeReceivedItem(itemId) {
  if (confirm('Are you sure you want to remove this received item?')) {
    db.collection("receivedItems").doc(itemId).delete().catch((error) => {
      console.error("Error removing item: ", error);
      alert('Error removing item. Please try again.');
    });
  }
}

function searchReceivedItems() {
  const searchTerm = (document.getElementById('receivedItemsSearch').value || '').toLowerCase();
  const rows = document.querySelectorAll('#receivedItemsTable tr');

  rows.forEach(row => {
    const itemName = row.cells[0].textContent.toLowerCase();
    row.style.display = itemName.includes(searchTerm) ? '' : 'none';
  });
}

function populateUpcomingReturns() {
  const tableBody = document.getElementById('upcomingReturnsTable');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const upcomingReturns = repairs.filter(r => {
    const returnDate = new Date(r.returnDate);
    const today = new Date();
    const diffDays = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));
    return !r.completed && diffDays >= 0 && diffDays <= 28;
  }).slice(0, 5);

  upcomingReturns.forEach(repair => {
    const returnDate = new Date(repair.returnDate);
    const today = new Date();
    const diffDays = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${e(repair.employeeName || '-')}</td>
      <td>${(repair.items || []).map(item => e(item.itemReplaced || '')).join(', ')}</td>
      <td>${isFinite(diffDays) ? diffDays : '-'}</td>
    `;
    tableBody.appendChild(row);
  });
}

function populateAllRepairs() {
  const tableBody = document.getElementById('allRepairsTable');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  repairs.forEach(repair => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${e(repair.serviceDate || '')}</td>
      <td>${e(repair.employeeName || '')}</td>
      <td>${e(repair.jobNumber || '-')}</td>
      <td>${e(repair.pcSerial || '')}</td>
      <td>${repair.items?.map(item => e(item.itemReplaced || '')).join(', ') || ''}</td>
      <td><span class="badge ${repair.completed ? 'bg-success' : 'bg-warning text-dark'}">${repair.completed ? 'Completed' : 'In Progress'}</span></td>
      <td>${e(repair.returnDate || '')}</td>
      <td>Rs ${Number(repair.totalPrice || 0).toFixed(2)}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-primary me-1" title="Print" onclick="printRepair('${repair.id}')">
          <i class="fas fa-print"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning me-1" title="Edit" onclick="openEditRepair('${repair.id}')">
          <i class="fas fa-edit"></i>
        </button>
        ${repair.completed
          ? '<button class="btn btn-sm btn-outline-secondary" disabled title="Completed"><i class="fas fa-check"></i></button>'
          : `<button class="btn btn-sm btn-outline-success" title="Mark Completed" onclick="completeRepair('${repair.id}')">
               <i class="fas fa-check"></i>
             </button>`
        }
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function sortApprovalsLatestFirst(list) {
  return list.slice().sort((a, b) => {
    const aTime = a.timestamp?.toMillis?.() || (a.date ? new Date(a.date).getTime() : 0);
    const bTime = b.timestamp?.toMillis?.() || (b.date ? new Date(b.date).getTime() : 0);
    return bTime - aTime;
  });
}

function populatePreviousApprovals() {
  const tableBody = document.getElementById('previousApprovalsTable');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const toggleBtn = document.getElementById('toggleApprovalsViewBtn');

  let list = sortApprovalsLatestFirst(committeeApprovals);

  if (approvalDateSearchTerm) {
    list = list.filter(approval => (approval.date || '').toLowerCase().includes(approvalDateSearchTerm));
  }

  const sectionFilter = (approvalLocationFilter || '').toLowerCase();
  if (sectionFilter) {
    list = list.filter(approval =>
      (approval.items || []).some(it => (it.section || '').toLowerCase() === sectionFilter)
    );
  }

  const toRender = showAllApprovals ? list : list.slice(0, 5);

  toRender.forEach(approval => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${e(approval.date || '')}</td>
      <td>Rs ${Number(approval.totalAmount || 0).toFixed(2)}</td>
      <td>${e(approval.chairman || '')}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-primary me-1" title="Print" onclick="printCommitteeApproval('${approval.id}')">
          <i class="fas fa-print"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning me-1" title="Edit" onclick="startEditApproval('${approval.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="deleteCommitteeApproval('${approval.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  if (toggleBtn) {
    toggleBtn.textContent = showAllApprovals ? 'Show Latest 5' : 'View All';
  }
}

function completeRepair(repairId) {
  db.collection("repairs").doc(repairId).update({
    completed: true,
    status: 'Completed'
  }).catch((error) => {
    console.error("Error updating repair: ", error);
    alert('Error completing repair. Please try again.');
  });
}

function findReceivedItemBySerial(serial) {
  if (!serial) return null;
  const s = String(serial).toLowerCase();
  for (const item of receivedItems) {
    if (item.serialNumbers && item.serialNumbers.some(sn => String(sn).toLowerCase() === s)) {
      return item;
    }
    if (item.newSerial && String(item.newSerial).toLowerCase() === s) {
      return item;
    }
  }
  return null;
}

// Make main "Item Replaced" optional: only push items that have some data
async function addNewRepair() {
  const employeeName = document.getElementById('repairEmployeeName').value;
  const region = document.getElementById('repairRegion').value;
  const district = document.getElementById('repairDistrict').value;
  const pcSerial = document.getElementById('repairPcSerialNumber').value;
  const jobNumber = (document.getElementById('repairJobNumber')?.value || '').trim() || generateJobNumber();
  const gatePassNo = (document.getElementById('repairGatePassNo')?.value || '').trim();
  const errorDetails = document.getElementById('repairErrorDetails').value;
  const serviceDate = document.getElementById('repairServiceDate').value;
  const returnDate = document.getElementById('repairReturnDate').value;

  const items = [];
  let totalPrice = 0;

  // Main item (optional)
  const mainItemSelect = document.querySelector('.repair-item-select');
  const mainItemOtherInput = document.querySelector('.repair-other-item-input input');
  const mainItemReceived = !!document.querySelector('.item-received-check')?.checked;
  const mainItemNewSerial = document.querySelector('.repair-new-serial').value;
  const mainItemOldSerial = document.querySelector('.repair-old-serial').value;
  const mainItemUnitPrice = parseFloat(document.querySelector('.repair-unit-price').value) || 0;
  const mainItemQuantity = parseInt(document.querySelector('.repair-quantity').value) || 1;
  const mainItemTotalPrice = parseFloat(document.querySelector('.repair-total-price').value) || 0;

  const mainItemName = mainItemSelect?.value === 'other' ? (mainItemOtherInput?.value || '') : (mainItemSelect?.value || '');

  const hasMainData = !!(mainItemName || mainItemNewSerial || mainItemOldSerial || mainItemUnitPrice > 0 || mainItemQuantity > 1);

  if (hasMainData) {
    items.push({
      itemReplaced: mainItemName || '',
      itemReceived: mainItemReceived,
      newSerial: mainItemNewSerial || '',
      oldSerial: mainItemOldSerial || '',
      unitPrice: mainItemUnitPrice,
      quantity: mainItemQuantity,
      totalPrice: mainItemTotalPrice
    });
    totalPrice += mainItemTotalPrice;
  }

  // Additional items
  const additionalItems = document.querySelectorAll('.additional-item');
  additionalItems.forEach(item => {
    const itemSelect = item.querySelector('.repair-item-select');
    const itemOtherInput = item.querySelector('.repair-other-item-input input');
    const itemReceived = item.querySelector('.item-received-check').checked;
    const itemNewSerial = item.querySelector('.repair-new-serial').value;
    const itemOldSerial = item.querySelector('.repair-old-serial').value;
    const itemUnitPrice = parseFloat(item.querySelector('.repair-unit-price').value) || 0;
    const itemQuantity = parseInt(item.querySelector('.repair-quantity').value) || 1;
    const itemTotalPrice = parseFloat(item.querySelector('.repair-total-price').value) || 0;

    const itemName = itemSelect.value === 'other' ? (itemOtherInput.value || '') : (itemSelect.value || '');
    const hasData = !!(itemName || itemNewSerial || itemOldSerial || itemUnitPrice > 0 || itemQuantity > 1);

    if (hasData) {
      items.push({
        itemReplaced: itemName || '',
        itemReceived: itemReceived,
        newSerial: itemNewSerial || '',
        oldSerial: itemOldSerial || '',
        unitPrice: itemUnitPrice,
        quantity: itemQuantity,
        totalPrice: itemTotalPrice
      });
      totalPrice += itemTotalPrice;
    }
  });

  // Enrich items with inventory details
  items.forEach(it => {
    if (it.itemReceived && it.newSerial) {
      const found = findReceivedItemBySerial(it.newSerial);
      if (found) {
        it.invoiceNumber = found.invoiceNumber || '';
        it.warrantyPeriod = found.warrantyPeriod || '';
        it.supplier = found.supplier || '';
        it.itemName = found.itemName || it.itemReplaced || '';
        it.capacity = found.capacity || null;
        it.fileNumber = found.fileNumber || '';
        it.poNumber = found.poNumber || '';
        it.invoiceUrl = found.invoiceUrl || '';
      }
    }
  });

  const newRepair = {
    employeeName,
    region,
    district,
    pcSerial,
    jobNumber,
    gatePassNo,
    errorDetails,
    serviceDate,
    returnDate,
    items,
    totalPrice,
    completed: false,
    status: 'In Progress',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("repairs").add(newRepair);

    // Remove selected serial(s) from inventory after saving repair
    const updates = [];
    items.forEach(it => {
      if (it.itemReceived && it.newSerial) {
        const found = findReceivedItemBySerial(it.newSerial);
        if (found) updates.push(updateReceivedItemQuantity(found.id, 1, it.newSerial));
      }
    });
    if (updates.length) await Promise.allSettled(updates);

    alert('Repair submitted successfully!');
    document.getElementById('repairForm').reset();
    document.getElementById('additionalItemsContainer').innerHTML = '';
    setDefaultDates();
    generateJobNumber();

    // Re-bind toggles after reset (for main item)
    bindRepairItemSelectToggles();
  } catch (error) {
    console.error("Error adding repair: ", error);
    alert('Error submitting repair. Please try again.');
  }
}

// ===== Committee Approval: helpers for edit/update + Job Card linking =====
function toggleApprovalTableHeader() {
  const thead = document.querySelector('#approvalItemsTable thead');
  const hasRows = document.querySelectorAll('#approvalItemsBody tr').length > 0;
  if (thead) thead.style.display = hasRows ? 'table-header-group' : 'none';
}

function createApprovalItemRow({ description, region, section, costCenter, qty, unitRate, amount }) {
  const tableBody = document.getElementById('approvalItemsBody');
  const rowCount = tableBody.querySelectorAll('tr').length;
  const tr = document.createElement('tr');
  const qtyVal = parseNumber(qty) || 0;
  const unitVal = parseNumber(unitRate) || 0;
  const amtVal = parseNumber(amount) || (qtyVal * unitVal);

  tr.innerHTML = `
    <td>${rowCount + 1}</td>
    <td>${e(description || '')}</td>
    <td>${e(region || '')}</td>
    <td>${e(section || '')}</td>
    <td>${e(costCenter || '')}</td>
    <td>${qtyVal}</td>
    <td>${unitVal.toFixed(2)}</td>
    <td>${amtVal.toFixed(2)}</td>
    <td>
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove(); updateApprovalItemNumbers(); toggleApprovalTableHeader();">
        <i class="fas fa-times"></i>
      </button>
    </td>
  `;
  tableBody.appendChild(tr);
  updateApprovalItemNumbers();
  toggleApprovalTableHeader();
}

// Build job card label for the multi-select
function jobCardOptionLabel(rep) {
  const job = rep.jobNumber || '-';
  const pc = rep.pcSerial || '-';
  const gp = rep.gatePassNo || '-';
  return `${job} — PC: ${pc} — Gate Pass: ${gp}`;
}

// Populate the job card multi-select
function populateApprovalJobCardOptions(preselect = null) {
  const sel = document.getElementById('approvalLinkedJobCards');
  if (!sel) return;

  const prev = preselect ?? Array.from(sel.selectedOptions || []).map(o => o.value);
  const selected = new Set(prev);

  sel.innerHTML = '';

  const withJobs = repairs.filter(r => r.jobNumber && String(r.jobNumber).trim() !== '');
  withJobs.sort((a, b) => {
    const at = a.timestamp?.toMillis?.() || 0;
    const bt = b.timestamp?.toMillis?.() || 0;
    return bt - at;
  });

  withJobs.forEach(rep => {
    const opt = document.createElement('option');
    opt.value = rep.jobNumber;
    opt.textContent = jobCardOptionLabel(rep);
    if (selected.has(rep.jobNumber)) opt.selected = true;
    sel.appendChild(opt);
  });
}

// Read selected job cards from UI
function getSelectedLinkedJobCardsFromUI() {
  const sel = document.getElementById('approvalLinkedJobCards');
  if (!sel) return [];
  return Array.from(sel.selectedOptions || []).map(o => o.value);
}

function startEditApproval(approvalId) {
  showPage('committeeApprovalPage');

  const approval = committeeApprovals.find(a => a.id === approvalId);
  if (!approval) {
    alert('Approval not found.');
    return;
  }

  editingApprovalId = approvalId;
  editingApproval = approval;

  // Fill basic fields
  const dateEl = document.getElementById('approvalDate');
  const vatEl = document.getElementById('vatPercentage');
  const mrEl = document.getElementById('approvalMrNumber');
  const prEl = document.getElementById('approvalPrNumber');
  const chairmanSel = document.getElementById('chairmanName');
  const otherChairmanWrap = document.getElementById('otherChairmanNameWrap');
  const otherChairmanInput = document.getElementById('otherChairmanName');
  const memberEl = document.getElementById('memberName');
  const otherMemberEl = document.getElementById('otherMemberName');

  if (dateEl) dateEl.value = approval.date || '';
  if (vatEl) vatEl.value = approval.vatPercentage ?? 0;
  if (mrEl) mrEl.value = approval.mrNumber || '';
  if (prEl) prEl.value = approval.prNumber || '';
  if (memberEl) memberEl.value = approval.member || '';
  if (otherMemberEl) otherMemberEl.value = approval.otherMember || '';

  // Chairman
  if (chairmanSel) {
    if (approval.chairman === 'DGM (C)') {
      chairmanSel.value = 'DGM (C)';
      toggleOtherChairmanField();
      if (otherChairmanInput) otherChairmanInput.value = '';
    } else {
      chairmanSel.value = 'Other';
      toggleOtherChairmanField();
      if (otherChairmanInput) otherChairmanInput.value = approval.chairman || '';
      if (otherChairmanWrap) otherChairmanWrap.style.display = 'block';
    }
  }

  // Items table
  const tbody = document.getElementById('approvalItemsBody');
  if (tbody) tbody.innerHTML = '';
  (approval.items || []).forEach(it => {
    createApprovalItemRow({
      description: it.description,
      region: it.region,
      section: it.section,
      costCenter: it.costCenter,
      qty: it.qty,
      unitRate: it.unitRate,
      amount: it.amount
    });
  });
  toggleApprovalTableHeader();

  // Preselect linked job cards in the multi-select
  const pre = Array.isArray(approval.linkedJobCards) ? approval.linkedJobCards : [];
  populateApprovalJobCardOptions(pre);

  // Update submit button label
  const submitBtn = document.querySelector('#committeeForm button[type="submit"]');
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save me-1"></i> Update Approval';

  const form = document.getElementById('committeeForm');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}