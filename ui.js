function cancelEditApproval() {
  editingApprovalId = null;
  editingApproval = null;

  // Reset submit button text
  const submitBtn = document.querySelector('#committeeForm button[type="submit"]');
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save me-1"></i> Submit Approval';

  // Clear items table
  const tbody = document.getElementById('approvalItemsBody');
  if (tbody) tbody.innerHTML = '';
  toggleApprovalTableHeader();

  // Hide other chairman field
  const chairmanSel = document.getElementById('chairmanName');
  const otherChairmanWrap = document.getElementById('otherChairmanNameWrap');
  if (chairmanSel && otherChairmanWrap) {
    if (chairmanSel.value !== 'Other') otherChairmanWrap.style.display = 'none';
  }

  // Clear job card multiselect selection (keep options)
  const jcSel = document.getElementById('approvalLinkedJobCards');
  if (jcSel) Array.from(jcSel.options).forEach(o => o.selected = false);

  // Reset some defaults
  setDefaultDates();
  const vatEl = document.getElementById('vatPercentage');
  if (vatEl) vatEl.value = '0';
}

// ===== Email helpers =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}
function parseEmails(input) {
  return String(input || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e && isValidEmail(e));
}
const KNOWN_EMAILS_KEY = 'knownEmails';
function rememberEmails(emails) {
  if (!Array.isArray(emails) || emails.length === 0) return;
  const existing = JSON.parse(localStorage.getItem(KNOWN_EMAILS_KEY) || '[]');
  const set = new Set([...existing, ...emails]);
  localStorage.setItem(KNOWN_EMAILS_KEY, JSON.stringify([...set]));
}
function getKnownEmails() {
  try { return JSON.parse(localStorage.getItem(KNOWN_EMAILS_KEY) || '[]'); }
  catch { return []; }
}
function toggleOtherChairmanField() {
  const sel = document.getElementById('chairmanName');
  const wrap = document.getElementById('otherChairmanNameWrap');
  if (!sel || !wrap) return;
  wrap.style.display = sel.value === 'Other' ? 'block' : 'none';
}

// Committee Approval: create or update
function addCommitteeApproval() {
  const date = document.getElementById('approvalDate').value;
  const vatPercentage = parseFloat(document.getElementById('vatPercentage').value) || 0;
  const mrNumber = document.getElementById('approvalMrNumber')?.value.trim() || '';
  const prNumber = document.getElementById('approvalPrNumber')?.value.trim() || '';

  const chairmanSelect = document.getElementById('chairmanName');
  let chairman = chairmanSelect ? chairmanSelect.value : '';
  if (chairman === 'Other') {
    const otherChairmanInput = document.getElementById('otherChairmanName');
    chairman = (otherChairmanInput?.value?.trim())
      || (editingApproval?.chairman && editingApprovalId ? editingApproval.chairman : '');
  }
  if (chairman === 'Other') chairman = '';

  const member = document.getElementById('memberName').value;
  const otherMember = document.getElementById('otherMemberName').value;

  const items = [];
  let totalAmount = 0;

  const rows = document.querySelectorAll('#approvalItemsBody tr');
  rows.forEach(row => {
    const description = getCellValue(row.cells[1]);
    const region = getCellValue(row.cells[2]);
    const section = getCellValue(row.cells[3]);
    const costCenter = getCellValue(row.cells[4]);
    const qty = parseNumber(getCellValue(row.cells[5]));
    const unitRate = parseNumber(getCellValue(row.cells[6]));
    let amount = parseNumber(getCellValue(row.cells[7]));
    if (!amount) amount = qty * unitRate;

    items.push({ description, region, section, costCenter, qty, unitRate, amount });
    totalAmount += amount;
  });

  const vatAmount = (totalAmount * vatPercentage) / 100;
  const totalAmountWithVat = totalAmount + vatAmount;

  const linkedJobCards = getSelectedLinkedJobCardsFromUI();

  const payload = {
    date,
    items,
    chairman,
    member,
    otherMember,
    totalAmount,
    vatPercentage,
    vatAmount,
    totalAmountWithVat,
    mrNumber,
    prNumber,
    linkedJobCards
  };

  if (editingApprovalId) {
    db.collection("committeeApprovals").doc(editingApprovalId).update(payload)
      .then(() => {
        alert('Committee approval updated successfully!');
        document.getElementById('committeeForm').reset();
        cancelEditApproval();
      })
      .catch((error) => {
        console.error("Error updating committee approval: ", error);
        alert('Error updating approval. Please try again.');
      });
  } else {
    db.collection("committeeApprovals").add({
      ...payload,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
      .then(() => {
        alert('Committee approval submitted successfully!');
        document.getElementById('committeeForm').reset();
        document.getElementById('approvalItemsBody').innerHTML = '';
        document.getElementById('vatPercentage').value = '0';
        const jcSel = document.getElementById('approvalLinkedJobCards');
        if (jcSel) Array.from(jcSel.options).forEach(o => o.selected = false);
        setDefaultDates();
        toggleApprovalTableHeader();
      })
      .catch((error) => {
        console.error("Error adding committee approval: ", error);
        alert('Error submitting approval. Please try again.');
      });
  }
}

function addApprovalItem() {
  const description = document.getElementById('newItemDescription').value;
  const region = document.getElementById('newItemRegion').value;
  const section = document.getElementById('newItemSection').value;
  const costCenter = document.getElementById('newItemCostCenter').value || getCostCenterForSection(section);
  const qty = parseInt(document.getElementById('newItemQty').value) || 1;
  const unitRate = parseFloat(document.getElementById('newItemUnitRate').value) || 0;
  const amount = qty * unitRate;

  if (!description || !region || !section || !costCenter || unitRate <= 0) {
    alert('Please fill all required fields with valid values');
    return;
  }

  createApprovalItemRow({ description, region, section, costCenter, qty, unitRate, amount });

  document.getElementById('newItemDescription').value = '';
  document.getElementById('newItemRegion').value = '';
  const sect = document.getElementById('newItemSection');
  sect.innerHTML = '<option value="" selected disabled>Select Section</option>';
  sect.disabled = true;
  document.getElementById('newItemCostCenter').value = '';
  document.getElementById('newItemQty').value = '1';
  document.getElementById('newItemUnitRate').value = '';
}

function updateApprovalItemNumbers() {
  const rows = document.querySelectorAll('#approvalItemsBody tr');
  rows.forEach((row, index) => {
    row.cells[0].textContent = index + 1;
  });
}

// PRINT: Repair report
function printRepair(repairId) {
  const repair = repairs.find(r => r.id === repairId);
  if (!repair) return;

  const createdAt = (repair.timestamp && typeof repair.timestamp.toDate === 'function')
    ? repair.timestamp.toDate()
    : (repair.timestamp ? new Date(repair.timestamp) : null);

  const createdAtStr = createdAt ? createdAt.toLocaleDateString() : (repair.serviceDate || '');

  const itemsRowsHtml = (repair.items || []).map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${e(it.itemReplaced || '')}</td>
      <td>${e(it.oldSerial || '')}</td>
      <td>${e(it.newSerial || '')}</td>
      <td>${parseNumber(it.quantity || 1)}</td>
      <td>${formatMoney(it.unitPrice || 0)}</td>
      <td>${formatMoney(it.totalPrice || (parseNumber(it.quantity || 1) * parseNumber(it.unitPrice || 0)))}</td>
    </tr>
  `).join('');

  const subtotal = (repair.items || []).reduce((s, it) => s + (parseNumber(it.totalPrice) || (parseNumber(it.quantity) * parseNumber(it.unitPrice))), 0);
  const topRightDate = repair.serviceDate || new Date().toLocaleDateString();

  const printWindow = window.open('', '', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>Repair Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; position: relative; }
          h1 { font-size: 16px; color: #2a2a72; text-align: center; margin-bottom: 20px; }
          h2, h3 { font-size: 14px; color: #2a2a72; margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
          th { background-color: #f2f2f2; }
          .text-right { text-align: right; }
          .money { text-align: right; white-space: nowrap; }
          .print-date { position: fixed; top: 1.8cm; right: 1.6cm; font-size: 11px; color: #444; }
          @media print { @page { margin: 0; } body { margin: 1.6cm; } }
        </style>
      </head>
      <body>
        <div class="print-date">Date: ${topRightDate}</div>
        <h1>REPAIR REPORT</h1>

        <h3>Details</h3>
        <table>
          <tbody>
            <tr><th>Service Date</th><td>${e(repair.serviceDate || createdAtStr || '')}</td></tr>
            <tr><th>Employee Name</th><td>${e(repair.employeeName || '')}</td></tr>
            <tr><th>PC Serial</th><td>${e(repair.pcSerial || '')}</td></tr>
            <tr><th>Region</th><td>${e(repair.region || '')}</td></tr>
            <tr><th>Office</th><td>${e(repair.district || '')}</td></tr>
            <tr><th>Error Details</th><td>${e(repair.errorDetails || '')}</td></tr>
          </tbody>
        </table>

        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Item Replaced</th>
              <th>Old Serial</th>
              <th>New Serial</th>
              <th>Qty</th>
              <th>Unit Price (Rs)</th>
              <th>Total (Rs)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
            <tr>
              <td colspan="6" class="text-right"><strong>SUBTOTAL</strong></td>
              <td class="money"><strong>${formatMoney(subtotal || 0)}</strong></td>
            </tr>
          </tbody>
        </table>

        <script>
          window.onafterprint = function() { window.close(); };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
      printWindow.print();
      setTimeout(() => { printWindow.close(); }, 100);
  }, 500);
}

// PRINT: Committee Approval (with optional Job Card numbers)
function printCommitteeApproval(approvalId = null) {
  let approval;

  if (approvalId) {
    approval = committeeApprovals.find(a => a.id === approvalId);
    if (!approval) return;

    if (approval && (approval.totalAmount == null || isNaN(approval.totalAmount))) {
      approval.totalAmount = (approval.items || []).reduce((s, it) => s + parseNumber(it.amount), 0);
    }
    if (approval.vatPercentage === undefined) approval.vatPercentage = 0;
    if (approval.vatAmount === undefined) approval.vatAmount = (approval.totalAmount * approval.vatPercentage) / 100;
    if (approval.totalAmountWithVat === undefined) approval.totalAmountWithVat = approval.totalAmount + approval.vatAmount;

    approval.mrNumber = approval.mrNumber || '';
    approval.prNumber = approval.prNumber || '';
    approval.linkedJobCards = Array.isArray(approval.linkedJobCards) ? approval.linkedJobCards : [];
  } else {
    const date = document.getElementById('approvalDate').value || '';
    const vatPercentage = parseFloat(document.getElementById('vatPercentage').value) || 0;
    const mrNumber = document.getElementById('approvalMrNumber')?.value.trim() || '';
    const prNumber = document.getElementById('approvalPrNumber')?.value.trim() || '';

    const chairmanSelectEl = document.getElementById('chairmanName');
    let chairman = 'Not specified';
    if (chairmanSelectEl) {
      chairman = chairmanSelectEl.value === 'Other'
        ? (document.getElementById('otherChairmanName')?.value || 'Not specified')
        : (chairmanSelectEl.value || 'Not specified');
    }

    const member = document.getElementById('memberName').value || "Not specified";
    const otherMember = document.getElementById('otherMemberName').value || "Not specified";

    const items = [];
    const rows = document.querySelectorAll('#approvalItemsBody tr');

    if (rows.length > 0) {
      rows.forEach(row => {
        const qty = parseNumber(getCellValue(row.cells[5]));
        const unitRate = parseNumber(getCellValue(row.cells[6]));
        const amountCell = parseNumber(getCellValue(row.cells[7]));
        items.push({
          description: getCellValue(row.cells[1]),
          region: getCellValue(row.cells[2]),
          section: getCellValue(row.cells[3]),
          costCenter: getCellValue(row.cells[4]),
          qty,
          unitRate,
          amount: amountCell || (qty * unitRate)
        });
      });
    } else {
      const description = document.getElementById('newItemDescription').value;
      const region = document.getElementById('newItemRegion').value;
      const section = document.getElementById('newItemSection').value;
      const costCenter = document.getElementById('newItemCostCenter').value;
      const qty = parseNumber(document.getElementById('newItemQty').value) || 1;
      const unitRate = parseNumber(document.getElementById('newItemUnitRate').value) || 0;
      const amount = qty * unitRate;

      if (description || region || section || costCenter || unitRate) {
        items.push({ description, region, section, costCenter, qty, unitRate, amount });
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + (parseNumber(item.amount) || 0), 0);
    const vatAmount = (totalAmount * vatPercentage) / 100;
    const totalAmountWithVat = totalAmount + vatAmount;

    const linkedJobCards = getSelectedLinkedJobCardsFromUI();

    approval = {
      date,
      items,
      chairman,
      member,
      otherMember,
      totalAmount,
      vatPercentage,
      vatAmount,
      totalAmountWithVat,
      mrNumber,
      prNumber,
      linkedJobCards
    };
  }

  const normalizedItems = (approval.items || []).map(it => ({
    description: (it.description || '').trim(),
    region: (it.region || '').trim(),
    section: (it.section || '').trim(),
    costCenter: (it.costCenter || '').trim(),
    qty: parseNumber(it.qty),
    unitRate: parseNumber(it.unitRate),
    amount: parseNumber(it.amount) || (parseNumber(it.qty) * parseNumber(it.unitRate))
  }));

  const grouped = groupItemsForRowspan(normalizedItems);
  const subTotal = normalizedItems.reduce((s, it) => s + parseNumber(it.amount), 0);
  const vatAmountFinal = approval.vatPercentage > 0
    ? (approval.vatAmount != null ? parseNumber(approval.vatAmount) : (subTotal * parseNumber(approval.vatPercentage) / 100))
    : 0;
  const grandTotal = (approval.totalAmountWithVat != null)
    ? parseNumber(approval.totalAmountWithVat)
    : (subTotal + vatAmountFinal);

  const topRightDate = approval.date || new Date().toLocaleDateString();

  const jobCards = Array.isArray(approval.linkedJobCards) ? approval.linkedJobCards.filter(Boolean) : [];
  const jobCardsHtml = jobCards.length
    ? `<div style="margin: 12px 0; font-size: 12px;"><strong>JOB CARD NO:</strong> ${jobCards.join(', ')}</div>`
    : '';

  const circularHtml = `
<div style="margin: 30px 0 20px 0; text-align: left; font-size: 12px; line-height: 1.5;">
The Committee has been appointed in an accordance with the provision of circular No Add1.GM/CS/11 dated 20.04.2010.
</div>
  `;

  const printWindow = window.open('', '', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>Committee Approval</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; position: relative; }
          h1 { font-size: 16px; color: #2a2a72; text-align: center; margin-bottom: 20px; }
          h2, h3 { font-size: 14px; color: #2a2a72; margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 4px; text-align: left; vertical-align: top; }
          th { background-color: #f2f2f2; }
          .text-right { text-align: right; }
          .money { text-align: right; white-space: nowrap; }
          .print-date { position: fixed; top: 1.8cm; right: 1.6cm; font-size: 11px; color: #444; }

          table.committee-table { width: auto; border-collapse: separate; border-spacing: 0 8px; margin-top: 12px; }
          table.committee-table th, table.committee-table td { border: 0 !important; padding: 4px 6px; vertical-align: middle; }
          table.committee-table th { text-align: left; white-space: nowrap; font-weight: bold; width: 90px; }
          table.committee-table td.colon { width: 1ch; text-align: center; white-space: nowrap; }
          table.committee-table td.name { white-space: nowrap; }
          table.committee-table td.signature { width: 180px; }
          .signature-line { border-bottom: 1px dotted #000; width: 180px; display: inline-block; margin-left: 5px; }

          .mr-pr-wrapper { margin-top: 8vh; }
          table.mr-pr-table { width: auto; border-collapse: collapse; margin-top: 12px; }
          table.mr-pr-table td { border: 0; padding: 2px 6px; vertical-align: middle; }
          table.mr-pr-table td.role { width: 90px; white-space: nowrap; }
          table.mr-pr-table td.colon { width: 1ch; }
          table.mr-pr-table td.signature { width: 180px; }
          .mr-pr-box { border: 1px solid #000; min-width: 150px; height: 30px; display: inline-flex; align-items: center; padding: 0 8px; }

          @media print { @page { margin: 0; } body { margin: 1.6cm; } .mr-pr-wrapper { margin-top: 8vh; } }
        </style>
      </head>
      <body>
        <div class="print-date">Date: ${topRightDate}</div>
        <h1>RSC COMMITTEE APPROVAL</h1>
        
        <h3>ENG. ESTIMATED (Rs.)</h3>
        <table>
          <thead>
            <tr>
              <th>NO</th>
              <th>ITEM DESCRIPTION</th>
              <th>REGION</th>
              <th>SECTION</th>
              <th>COST CENTER</th>
              <th>Qty</th>
              <th>UNIT RATE</th>
              <th>AMOUNT (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              let idx = 1;
              const rowsHtml = [];
              grouped.forEach(group => {
                const span = group.rows.length;
                group.rows.forEach((r, i) => {
                  if (i === 0) {
                    rowsHtml.push(`
                      <tr>
                        <td>${idx++}</td>
                        <td>${e(r.description || '')}</td>
                        <td rowspan="${span}">${e(group.region || '')}</td>
                        <td rowspan="${span}">${e(group.section || '')}</td>
                        <td rowspan="${span}">${e(group.costCenter || '')}</td>
                        <td class="money">${parseNumber(r.qty).toLocaleString('en-US')}</td>
                        <td class="money">${formatMoney(r.unitRate)}</td>
                        <td class="money">${formatMoney(r.amount)}</td>
                      </tr>
                    `);
                  } else {
                    rowsHtml.push(`
                      <tr>
                        <td>${idx++}</td>
                        <td>${e(r.description || '')}</td>
                        <td class="money">${parseNumber(r.qty).toLocaleString('en-US')}</td>
                        <td class="money">${formatMoney(r.unitRate)}</td>
                        <td class="money">${formatMoney(r.amount)}</td>
                      </tr>
                    `);
                  }
                });
              });
              return rowsHtml.join('');
            })()}
            <tr>
              <td colspan="6" class="text-right"><strong>SUB TOTAL</strong></td>
              <td colspan="2" class="money"><strong>${formatMoney(subTotal)}</strong></td>
            </tr>
            ${approval.vatPercentage > 0 ? `
            <tr>
              <td colspan="6" class="text-right"><strong>VAT (${parseNumber(approval.vatPercentage)}%)</strong></td>
              <td colspan="2" class="money"><strong>${formatMoney(vatAmountFinal)}</strong></td>
            </tr>
            ` : ''}
            <tr>
              <td colspan="6" class="text-right"><strong>TOTAL</strong></td>
              <td colspan="2" class="money"><strong>${formatMoney(grandTotal)}</strong></td>
            </tr>
          </tbody>
        </table>

        ${jobCardsHtml}

        <div style="margin-top: 40px;"></div>
        <h3>COMMITTEE MEMBERS</h3>

        <table class="committee-table">
          <tbody>
            <tr>
              <th>CHAIRMAN</th>
              <td class="colon">:</td>
              <td class="name">${e(approval.chairman || '')}</td>
              <td class="colon">:</td>
              <td class="signature"><span class="signature-line"></span></td>
            </tr>
            <tr>
              <th>MEMBER</th>
              <td class="colon">:</td>
              <td class="name">${e(approval.member || '')}</td>
              <td class="colon">:</td>
              <td class="signature"><span class="signature-line"></span></td>
            </tr>
            <tr>
              <th>MEMBER</th>
              <td class="colon">:</td>
              <td class="name">${e(approval.otherMember || '')}</td>
              <td class="colon">:</td>
              <td class="signature"><span class="signature-line"></span></td>
            </tr>
          </tbody>
        </table>

        ${circularHtml}

        <div class="mr-pr-wrapper">
          <table class="mr-pr-table">
            <tbody>
              <tr>
                <td class="role"><strong>MR NO</strong></td>
                <td class="colon"></td>
                <td class="name"><span class="mr-pr-box">${e(approval.mrNumber || '')}</span></td>
                <td class="colon"></td>
                <td class="signature"></td>
              </tr>
              <tr>
                <td class="role"><strong>PR NUMBER</strong></td>
                <td class="colon"></td>
                <td class="name"><span class="mr-pr-box">${e(approval.prNumber || '')}</span></td>
                <td class="colon"></td>
                <td class="signature"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <script>
          window.onafterprint = function() { window.close(); };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
      printWindow.print();
      setTimeout(() => { printWindow.close(); }, 100);
  }, 500);
}

function searchApprovals() {
  approvalDateSearchTerm = (document.getElementById('approvalSearch').value || '').toLowerCase();
  populatePreviousApprovals();
}

// Build options for the location filter (sections)
function populateApprovalLocationOptions() {
  const sel = document.getElementById('approvalLocationFilter');
  if (!sel) return;

  sel.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All Locations';
  sel.appendChild(allOpt);

  const sections = new Set([
    ...Object.keys(sectionCostCenters),
    ...Object.keys(dynamicSectionCostCenters)
  ]);

  Array.from(sections).sort((a, b) => a.localeCompare(b)).forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec;
    opt.textContent = sec;
    sel.appendChild(opt);
  });
}

// Allow deleting a committee approval
function deleteCommitteeApproval(approvalId) {
  if (!approvalId) return;
  if (!confirm('Are you sure you want to delete this approval?')) return;

  db.collection('committeeApprovals').doc(approvalId).delete()
    .catch(err => {
      console.error('Error deleting approval:', err);
      alert('Error deleting approval. Please try again.');
    });
}

// System Tracking
function searchSystemTracking() {
  const searchTerm = (document.getElementById('systemTrackingSearch').value || '').trim();
  if (!searchTerm) {
    alert('Please enter a PC serial number to search');
    return;
  }

  const sLower = searchTerm.toLowerCase();
  const foundRepairs = repairs.filter(repair => 
    repair.pcSerial && String(repair.pcSerial).toLowerCase() === sLower
  );

  const resultsDiv = document.getElementById('systemTrackingResults');
  const noResultsDiv = document.getElementById('systemTrackingNoResults');

  if (foundRepairs.length > 0) {
    setText('trackingPcSerial', searchTerm);
    setText('trackingRepairCount', foundRepairs.length + ' repair(s)');
    
    const itemSerials = new Set();
    for (const repair of foundRepairs) {
      if (repair.items && repair.items.length > 0) {
        for (const item of repair.items) {
          if (item.newSerial) itemSerials.add(item.newSerial);
        }
      }
    }
    
    const dropdown = document.getElementById('itemSerialDropdown');
    dropdown.innerHTML = '<option value="" selected disabled>Select an item serial</option>';
    
    itemSerials.forEach(serial => {
      const option = document.createElement('option');
      option.value = serial;
      option.textContent = serial;
      dropdown.appendChild(option);
    });
    
    if (itemSerials.size > 0) {
      const firstSerial = Array.from(itemSerials)[0];
      dropdown.value = firstSerial;
      updateItemDetails();
    }
    
    populateTrackingHistory(searchTerm);
    if (resultsDiv) resultsDiv.style.display = 'block';
    if (noResultsDiv) noResultsDiv.style.display = 'none';
    return;
  }

  if (resultsDiv) resultsDiv.style.display = 'none';
  if (noResultsDiv) noResultsDiv.style.display = 'block';
  alert('PC serial number not found in repair records.');
}

function updateItemDetails() {
  const selectedSerial = document.getElementById('itemSerialDropdown').value;
  if (!selectedSerial) return;
  
  const pcSerial = document.getElementById('systemTrackingSearch').value.trim();
  const foundRepairs = repairs.filter(repair => 
    repair.pcSerial && String(repair.pcSerial).toLowerCase() === pcSerial.toLowerCase()
  );
  
  let selectedItem = null;
  for (const repair of foundRepairs) {
    if (repair.items && repair.items.length > 0) {
      for (const item of repair.items) {
        if (item.newSerial === selectedSerial) {
          selectedItem = item;
          break;
        }
      }
      if (selectedItem) break;
    }
  }
  
  if (selectedItem) {
    setText('trackingItemName', selectedItem.itemReplaced || 'N/A');
    setText('trackingItemSerial', selectedItem.newSerial || 'N/A');
    setText('trackingInvoice', selectedItem.invoiceNumber || 'N/A');
    setText('trackingWarranty', (selectedItem.warrantyPeriod != null ? selectedItem.warrantyPeriod : 'N/A'));
    setText('trackingSupplier', selectedItem.supplier || 'N/A');
    setText('trackingPrice', Number(selectedItem.unitPrice || 0).toFixed(2));
  }
}

function populateTrackingHistory(pcSerial) {
  const tableBody = document.getElementById('trackingHistoryTable');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const relatedRepairs = repairs.filter(repair => 
    repair.pcSerial && String(repair.pcSerial).toLowerCase() === pcSerial.toLowerCase()
  ).sort((a, b) => new Date(b.serviceDate || 0) - new Date(a.serviceDate || 0));

  if (relatedRepairs.length > 0) {
    relatedRepairs.forEach(repair => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${e(repair.serviceDate || '')}</td>
        <td>${e(repair.employeeName || '')}</td>
        <td>${e(repair.region || '')} / ${e(repair.district || '')}</td>
        <td>${e(repair.errorDetails || '')}</td>
        <td>${repair.items?.map(item => `${e(item.itemReplaced || '')} (${e(item.newSerial || 'no serial')})`).join(', ') || ''}</td>
        <td><span class="badge ${repair.completed ? 'bg-success' : 'bg-warning text-dark'}">${repair.completed ? 'Completed' : 'In Progress'}</span></td>
      `;
      tableBody.appendChild(row);
    });
  } else {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No repair history found for this PC</td>
      </tr>
    `;
  }
}

// File Tracking helpers
function renderFileTrackingStats() {
  const used = new Set();
  const current = new Set();

  repairs.forEach(r => (r.items || []).forEach(it => {
    if (it.fileNumber) used.add(String(it.fileNumber));
  }));

  receivedItems.forEach(it => {
    if (it.fileNumber) current.add(String(it.fileNumber));
  });

  const usedDiv = document.getElementById('usedFileNumbersList');
  const currentDiv = document.getElementById('currentFileNumbersList');
  if (usedDiv) usedDiv.textContent = used.size ? Array.from(used).join(', ') : 'None';
  if (currentDiv) currentDiv.textContent = current.size ? Array.from(current).join(', ') : 'None';
}

/* =========================
   JOB CARD: List + History
   ========================= */
function populateJobCardList() {
  const tbody = document.getElementById('jobCardEntriesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const withJobNumbers = repairs.filter(rep => rep.jobNumber && String(rep.jobNumber).trim() !== '');

  withJobNumbers.forEach(rep => {
    let submittedAt = '';
    if (rep.timestamp && typeof rep.timestamp.toDate === 'function') {
      submittedAt = rep.timestamp.toDate().toLocaleString();
    } else if (rep.timestamp) {
      const d = new Date(rep.timestamp);
      submittedAt = isNaN(d) ? (rep.serviceDate || '') : d.toLocaleString();
    } else {
      submittedAt = rep.serviceDate || '';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e(rep.jobNumber || '-')}</td>
      <td>${e(submittedAt)}</td>
      <td>${e(rep.pcSerial || '')}</td>
      <td>${e(rep.region || '')}</td>
      <td>${e(rep.district || '')}</td>
      <td>${e(rep.gatePassNo || '-')}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-warning me-2" onclick="openJobCardQuickEdit('${rep.id}')">
          <i class="fas fa-edit me-1"></i> Edit
        </button>
        <button class="btn btn-sm btn-primary" onclick="printJobCard('${rep.id}')">
          <i class="fas fa-print me-1"></i> Print
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
// Quick Edit state
let editingJobCardId = null;

// Fill Regions
function fillQuickEditRegions(selectedRegion = '') {
  const regionSel = document.getElementById('jobCardEditRegion');
  if (!regionSel) return;
  const regions = getAllRegions(); // from core.js
  const prev = selectedRegion || regionSel.value;

  regionSel.innerHTML = '<option value="" disabled>Select Region</option>';
  regions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    regionSel.appendChild(opt);
  });

  if (prev && regions.includes(prev)) regionSel.value = prev;

  // Enable/disable Office select
  const officeSel = document.getElementById('jobCardEditSection');
  if (officeSel) officeSel.disabled = !regionSel.value;
}

// Fill Offices/Sections based on Region
function fillQuickEditSections(selectedSection = '') {
  const regionSel = document.getElementById('jobCardEditRegion');
  const officeSel = document.getElementById('jobCardEditSection');
  if (!regionSel || !officeSel) return;

  const region = regionSel.value;
  officeSel.innerHTML = '<option value="" disabled>Select Office</option>';
  officeSel.disabled = !region;

  if (!region) return;

  const secs = sectionsFor(region); // from core.js
  secs.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec;
    opt.textContent = sec;
    officeSel.appendChild(opt);
  });

  if (selectedSection && secs.includes(selectedSection)) {
    officeSel.value = selectedSection;
  }
}

// Open Quick Edit Modal
function openJobCardQuickEdit(repairId) {
  const rep = repairs.find(r => r.id === repairId);
  if (!rep) {
    alert('Job Card not found.');
    return;
  }
  editingJobCardId = repairId;

  // Pre-fill fields
  document.getElementById('jobCardEditJobNumber').value = rep.jobNumber || '-';
  document.getElementById('jobCardEditPcSerial').value = rep.pcSerial || '';
  document.getElementById('jobCardEditGatePassNo').value = rep.gatePassNo || '';

  // Regions/Offices
  fillQuickEditRegions(rep.region || '');
  fillQuickEditSections(rep.district || '');

  const modalEl = document.getElementById('jobCardQuickEditModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

// Save Quick Edit
async function saveJobCardQuickEdit() {
  if (!editingJobCardId) return;

  const pcSerial = (document.getElementById('jobCardEditPcSerial')?.value || '').trim();
  const region = document.getElementById('jobCardEditRegion')?.value || '';
  const district = document.getElementById('jobCardEditSection')?.value || '';
  const gatePassNo = (document.getElementById('jobCardEditGatePassNo')?.value || '').trim();

  if (!pcSerial || !region || !district) {
    alert('Please fill PC Serial, Region, and Office.');
    return;
  }

  const btn = document.getElementById('jobCardEditSaveBtn');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

  try {
    await db.collection('repairs').doc(editingJobCardId).update({
      pcSerial,
      region,
      district,
      gatePassNo
    });

    const modalEl = document.getElementById('jobCardQuickEditModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    editingJobCardId = null;
    alert('Job Card updated.');
  } catch (err) {
    console.error('Error updating Job Card:', err);
    alert('Error updating Job Card. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

// Wire events (run after DOM is ready)
document.addEventListener('DOMContentLoaded', () => {
  const regionSel = document.getElementById('jobCardEditRegion');
  if (regionSel) {
    regionSel.addEventListener('change', () => {
      fillQuickEditSections();
    });
  }
  const saveBtn = document.getElementById('jobCardEditSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveJobCardQuickEdit);
  }
});
// Print a JOB CARD
// REPLACE: printJobCard()
function printJobCard(repairId) {
const rep = repairs.find(r => r.id === repairId);
if (!rep) return;

  const html = `
    <html>
      <head>
        <title>JOB CARD</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          h1 { text-align: center; color: #2a2a72; margin: 0 0 16px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
          th { width: 220px; background: #f5f7fb; }
          .signature { margin-top: 40px; display: flex; justify-content: flex-end; }
          .sig-box { text-align: center; width: 260px; }
          .sig-line { border-top: 1px solid #000; margin-top: 60px; }
          .label { font-weight: bold; }
          @media print { @page { margin: 0; } body { margin: 1.6cm; } }
        </style>
      </head>
      <body>
        <h1>JOB CARD</h1>
        <table>
          <tbody>
            <tr><th>Job Card Number</th><td>${e(rep.jobNumber || '-')}</td></tr>
            <tr><th>Date</th><td>${e(rep.serviceDate || '')}</td></tr>
            <tr><th>PC Serial Number</th><td>${e(rep.pcSerial || '')}</td></tr>
            <tr><th>Region</th><td>${e(rep.region || '')}</td></tr>
            <tr><th>Office</th><td>${e(rep.district || '')}</td></tr>
            <tr><th>Gate Pass Number</th><td>${e(rep.gatePassNo || '-')}</td></tr>
            <tr><th>Description of Problem</th><td>${e(rep.errorDetails || '')}</td></tr>
          </tbody>
        </table`>

  + `>
        <div class="signature">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="label">Authorized Signature</div>
          </div>
        </div>

        <script>window.onafterprint = function(){ window.close(); };</script>
      </body>
    </html>
  `;

  const w = window.open('', '', 'width=800,height=600');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); setTimeout(() => w.close(), 100); }, 300);
}

// Search Job Card History by Job Card Number
function searchJobCardsByNumber() {
  const input = document.getElementById('jobCardSearchInput');
  if (!input) return;
  const q = (input.value || '').trim();
  if (!q) return;

  const target = repairs.find(r => (r.jobNumber || '').toLowerCase() === q.toLowerCase());
  const tbody = document.getElementById('jobCardHistoryTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!target) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">No job card found for ${e(q)}</td></tr>`;
    return;
  }

  const hist = repairs
    .filter(r => r.pcSerial && target.pcSerial && String(r.pcSerial).toLowerCase() === String(target.pcSerial).toLowerCase())
    .sort((a, b) => new Date(b.serviceDate || 0) - new Date(a.serviceDate || 0));

  if (!hist.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No history found for this product.</td></tr>`;
    return;
  }

  hist.forEach(r => {
    const statusBar = r.completed
      ? `<div class="progress" style="height:18px;">
           <div class="progress-bar bg-success" role="progressbar" style="width: 100%;">Completed</div>
         </div>`
      : `<div class="progress" style="height:18px;">
           <div class="progress-bar bg-warning progress-bar-striped progress-bar-animated" role="progressbar" style="width: 50%; color:#000;">Processing</div>
         </div>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e(r.region || '')}</td>
      <td>${e(r.district || '')}</td>
      <td>${e(r.pcSerial || '')}</td>
      <td>${e(r.gatePassNo || '-')}</td>
      <td>${e(r.errorDetails || '')}</td>
      <td>${e(r.serviceDate || '')}</td>
      <td>${r.completed ? 'Completed' : statusBar}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================
   DEV.OPTN (Custom Locations)
   ========================= */
function renderCustomLocationsList() {
  const tbody = document.getElementById('customLocationsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!customLocations.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No custom locations added yet.</td></tr>`;
    return;
  }

  customLocations.forEach(loc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e(loc.region || '')}</td>
      <td>${e(loc.section || '')}</td>
      <td>${e(loc.costCenter || '')}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomLocation('${e(loc.id)}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function addCustomLocation() {
  const region = (document.getElementById('devRegionInput')?.value || '').trim();
  const section = (document.getElementById('devSectionInput')?.value || '').trim();
  const costCenter = (document.getElementById('devCostCenterInput')?.value || '').trim();

  if (!region || !section || !costCenter) {
    alert('Please fill region, office/section, and cost center.');
    return;
  }

  // Prevent duplicate region+section combo in customLocations
  const dup = customLocations.find(c => c.region.toLowerCase() === region.toLowerCase() && c.section.toLowerCase() === section.toLowerCase());
  if (dup) {
    if (!confirm('This region + section already exists in custom locations. Update cost center?')) return;
    db.collection('customLocations').doc(dup.id).update({
      costCenter,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      alert('Custom location updated.');
      (document.getElementById('customLocationForm'))?.reset();
      populateRegionDatalist();
    }).catch(err => {
      console.error('Error updating custom location:', err);
      alert('Error updating. Please try again.');
    });
    return;
  }

  db.collection('customLocations').add({
    region,
    section,
    costCenter,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    alert('Custom location added.');
    (document.getElementById('customLocationForm'))?.reset();
    populateRegionDatalist();
  }).catch(err => {
    console.error('Error adding custom location:', err);
    alert('Error adding. Please try again.');
  });
}

function deleteCustomLocation(id) {
  if (!id) return;
  if (!confirm('Delete this custom location?')) return;
  db.collection('customLocations').doc(id).delete().catch(err => {
    console.error('Error deleting custom location:', err);
    alert('Error deleting. Please try again.');
  });
}

/* =========================
   Received Items: add
   ========================= */
function addReceivedItem() {
  try {
    const nameSel = document.getElementById('receivedItemName');
    const otherName = (document.getElementById('otherItemName')?.value || '').trim();
    let itemName = nameSel?.value || '';
    if (!itemName) return alert('Please select an item name');
    if (itemName === 'other') {
      if (!otherName) return alert('Please enter the other item name');
      itemName = otherName;
    }

    const primarySerial = (document.getElementById('receivedItemSerial')?.value || '').trim();
    const invoiceNumber = (document.getElementById('receivedItemInvoice')?.value || '').trim();
    const fileNumber = (document.getElementById('receivedItemFileNumber')?.value || '').trim();
    const poNumber = (document.getElementById('receivedItemPONumber')?.value || '').trim();
    const warrantyPeriod = parseInt(document.getElementById('receivedItemWarranty')?.value || '0', 10) || 0;
    const supplier = (document.getElementById('receivedItemSupplier')?.value || '').trim();
    const unitPrice = parseFloat(document.getElementById('receivedItemPrice')?.value || '0') || 0;
    const quantity = parseInt(document.getElementById('receivedItemQuantity')?.value || '1', 10) || 1;

    const capacityField = document.getElementById('receivedItemCapacity');
    const rawItemNameLower = itemName.toLowerCase();
    const capacityApplies = ['ram', 'hard disk', 'ssd'].includes(rawItemNameLower);
    const capacity = capacityApplies ? (parseInt(capacityField?.value || '0', 10) || null) : null;

    if (!primarySerial) return alert('Please enter the primary serial number');
    if (!invoiceNumber) return alert('Please enter the invoice number');
    if (!supplier) return alert('Please enter the supplier');
    if (unitPrice <= 0) return alert('Please enter a valid unit price');
    if (quantity < 1) return alert('Quantity must be at least 1');
    if (capacityApplies && !capacity) return alert('Please enter storage capacity (GB)');

    const serials = [primarySerial];
    const extraInputs = document.querySelectorAll('#additionalSerialNumbers .serial-number-input input');
    extraInputs.forEach(inp => {
      const v = (inp.value || '').trim();
      if (v) serials.push(v);
    });

    if (quantity > 1) {
      const uniqueSerials = Array.from(new Set(serials));
      if (uniqueSerials.length !== quantity) {
        return alert(`Please enter exactly ${quantity} unique serial numbers (you entered ${uniqueSerials.length}).`);
      }
    }

    const payload = {
      itemName: rawItemNameLower,
      capacity: capacityApplies ? capacity : null,
      invoiceNumber,
      fileNumber,
      poNumber,
      warrantyPeriod,
      supplier,
      unitPrice,
      quantity,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (quantity > 1) {
      payload.serialNumbers = serials;
    } else {
      payload.newSerial = primarySerial;
    }

    db.collection('receivedItems').add(payload)
      .then(() => {
        alert('Received item added successfully!');
        const form = document.getElementById('receivedItemForm');
        form?.reset();
        const addWrap = document.getElementById('additionalSerialNumbers');
        if (addWrap) addWrap.innerHTML = '';
        const serialWrap = document.getElementById('serialNumbersContainer');
        if (serialWrap) serialWrap.style.display = 'none';
        const capFieldWrap = document.getElementById('storageCapacityField');
        if (capFieldWrap) capFieldWrap.style.display = 'none';
      })
      .catch(err => {
        console.error('Error adding received item:', err);
        alert('Error adding item. Please try again.');
      });
  } catch (e) {
    console.error('addReceivedItem() failed:', e);
    alert('Something went wrong. Please try again.');
  }
}

// Misc helpers
function initializeItemReceivedCheckboxes() {
  const mainCheckbox = document.querySelector('.item-received-check');
  if (mainCheckbox) {
    mainCheckbox.addEventListener('change', function () {
      const isChecked = this.checked;
      const container = this.closest('.row').parentElement;

      container.querySelector('.repair-new-serial').disabled = !isChecked;
      container.querySelector('.repair-unit-price').disabled = !isChecked;
      container.querySelector('.repair-quantity').disabled = !isChecked;

      container.querySelector('.repair-total-price').removeAttribute('disabled');

      if (!isChecked) {
        container.querySelector('.repair-new-serial').value = '';
        container.querySelector('.repair-unit-price').value = '';
        container.querySelector('.repair-quantity').value = '1';
        container.querySelector('.repair-total-price').value = '';
      }
    });
  }

  const unitPriceInputs = document.querySelectorAll('.repair-unit-price');
  const quantityInputs = document.querySelectorAll('.repair-quantity');

  unitPriceInputs.forEach(input => input.addEventListener('input', () => calculateRepairTotal(input)));
  quantityInputs.forEach(input => input.addEventListener('input', () => calculateRepairTotal(input)));
}

function calculateRepairTotal(input) {
  const container = input.closest('.row').parentElement;
  const unitPrice = parseFloat(container.querySelector('.repair-unit-price').value) || 0;
  const quantity = parseInt(container.querySelector('.repair-quantity').value) || 1;
  container.querySelector('.repair-total-price').value = (unitPrice * quantity).toFixed(2);
}

function bindRepairItemSelectToggles(root) {
  const scope = root || document;
  const selects = scope.querySelectorAll('.repair-item-select');
  selects.forEach(sel => {
    if (sel.dataset.bound === '1') return;
    sel.addEventListener('change', function () {
      let otherWrap = this.closest('.col-md-6')?.querySelector('.repair-other-item-input');
      if (!otherWrap) {
        otherWrap = this.parentElement.querySelector('.repair-other-item-input');
      }
      if (otherWrap) {
        otherWrap.style.display = this.value === 'other' ? 'block' : 'none';
      }
    });
    sel.dataset.bound = '1';
  });
}

// ====== Login overlay + sequence ======
function showAuthOverlay() {
  const ov = document.getElementById('authOverlay');
  if (!ov) return;
  resetAuthOverlay();
  ov.classList.add('show');
}

function hideAuthOverlay() {
  const ov = document.getElementById('authOverlay');
  if (!ov) return;
  ov.classList.remove('show');
}

function resetAuthOverlay() {
  const steps = document.querySelectorAll('#authSteps .auth-step');
  steps.forEach(li => {
    li.classList.remove('active', 'done', 'fail');
    const iconSpin = li.querySelector('.icon-pending');
    const iconDone = li.querySelector('.icon-done');
    const iconFail = li.querySelector('.icon-fail');
    if (iconSpin) iconSpin.classList.add('d-none');
    if (iconDone) iconDone.classList.add('d-none');
    if (iconFail) iconFail.classList.add('d-none');
  });
  setAuthStep(1, 'active');
  setProgress(0);
}

function setProgress(pct) {
  const bar = document.getElementById('authProgress');
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function setAuthStep(stepNumber, state) {
  const li = document.querySelector(`#authSteps .auth-step[data-step="${stepNumber}"]`);
  if (!li) return;
  const iconSpin = li.querySelector('.icon-pending');
  const iconDone = li.querySelector('.icon-done');
  const iconFail = li.querySelector('.icon-fail');

  li.classList.remove('active', 'done', 'fail');
  if (iconSpin) iconSpin.classList.add('d-none');
  if (iconDone) iconDone.classList.add('d-none');
  if (iconFail) iconFail.classList.add('d-none');

  if (state === 'active') {
    li.classList.add('active');
    if (iconSpin) iconSpin.classList.remove('d-none');
  } else if (state === 'done') {
    li.classList.add('done');
    if (iconDone) iconDone.classList.remove('d-none');
  } else if (state === 'fail') {
    li.classList.add('fail');
    if (iconFail) iconFail.classList.remove('d-none');
  }
}

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function pingFirestore(timeoutMs = 1500) {
  const p = db.collection('_ping').limit(1).get();
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
  return Promise.race([p, t]).catch(err => { throw err; });
}

async function waitForDataReady(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (dataReady.repairs && dataReady.received && dataReady.approvals) return true;
    await wait(100);
  }
  return false;
}

async function runLoginAnimationSequence() {
  showAuthOverlay();

  // Step 1: Authenticating
  setAuthStep(1, 'active');
  setProgress(12);
  await wait(450);
  setAuthStep(1, 'done');

  // Step 2: Secure session
  setAuthStep(2, 'active');
  setProgress(28);
  await wait(400);
  setAuthStep(2, 'done');

  // Step 3: Connect DB
  setAuthStep(3, 'active');
  setProgress(45);
  let dbOk = true;
  try {
    await pingFirestore(1500);
  } catch (e) {
    dbOk = false;
  }
  setAuthStep(3, dbOk ? 'done' : 'fail');
  setProgress(60);

  // Step 4: Sync data (wait for first snapshots or timeout)
  setAuthStep(4, 'active');
  const ready = await waitForDataReady(2500);
  setAuthStep(4, ready ? 'done' : 'done'); // mark done either way (we have fallback UI)
  setProgress(85);

  // Step 5: Prepare UI
  setAuthStep(5, 'active');
  await wait(350);
  setAuthStep(5, 'done');
  setProgress(100);

  await wait(350);
  hideAuthOverlay();
}

function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (admins[username] && admins[username].password === password) {
    currentUser = username;
    runLoginAnimationSequence()
      .then(() => loginSuccess())
      .catch(() => loginSuccess()); // even if animation hiccups, continue
  } else {
    alert('Invalid credentials. Please try again.');
  }
}

function loginSuccess() {
  document.getElementById('login').classList.remove('active');
  document.body.classList.remove('login-page');

  document.getElementById('repairDashboard').classList.add('active');

  // Existing admin labels
  document.getElementById('currentAdmin').textContent = admins[currentUser].name;
  const rAdmin = document.getElementById('receivedItemsAdmin');
  const cAdmin = document.getElementById('committeeAdmin');
  if (rAdmin) rAdmin.textContent = admins[currentUser].name;
  if (cAdmin) cAdmin.textContent = admins[currentUser].name;

  // Sidebar admin name
  const sAdmin = document.getElementById('sidebarCurrentAdmin');
  if (sAdmin) sAdmin.textContent = admins[currentUser].name;

  // Highlight Dashboard
  setActiveSidebar('repairDashboard');

  // Initial loads
  populateRegionSelects();
  populateUpcomingReturns();
  populateAllRepairs();
  populateReceivedItems();
  populatePreviousApprovals();
}

function logout() {
  currentUser = null;
  const active = document.querySelector('.page.active');
  if (active) active.classList.remove('active');
  document.getElementById('login').classList.add('active');
  document.body.classList.add('login-page');
  document.getElementById('loginForm').reset();
}

// Sidebar: set active highlight
function setActiveSidebar(targetId) {
  const buttons = document.querySelectorAll('#appSidebar .nav-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  const btn = Array.from(buttons).find(b => b.dataset.target === targetId);
  if (btn) btn.classList.add('active');
}

// Sidebar: init left menu navigation
function initSidebarNav() {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar) return;

  sidebar.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    const target = btn.dataset.target;
    if (target) showPage(target);
  });

  const logoutBtn = document.getElementById('sidebarLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => logout());
}

function showPage(pageId) {
  const active = document.querySelector('.page.active');
  if (active) active.classList.remove('active');
  document.getElementById(pageId).classList.add('active');

  // Update sidebar highlight
  setActiveSidebar(pageId);

  // Existing per-page init
  if (pageId === 'repairDashboard') {
    populateRegionSelects();
    populateUpcomingReturns();
    populateAllRepairs();
  } else if (pageId === 'receivedItemsPage') {
    populateReceivedItems();
  } else if (pageId === 'committeeApprovalPage') {
    populateRegionSelects();
    populatePreviousApprovals();
    populateApprovalJobCardOptions();
  } else if (pageId === 'jobCardListPage') {
    populateJobCardList();
  } else if (pageId === 'jobCardHistoryPage') {
    const y = new Date().getFullYear();
    const input = document.getElementById('jobCardSearchInput');
    if (input && !input.value) input.value = `RSC/${y}/`;
  } else if (pageId === 'devOptionsPage') {
    populateRegionDatalist();
    renderCustomLocationsList();
  }
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const serviceDateEl = document.getElementById('repairServiceDate');
  const approvalDateEl = document.getElementById('approvalDate');
  if (serviceDateEl) serviceDateEl.value = today;
  if (approvalDateEl) approvalDateEl.value = today;

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const returnDateEl = document.getElementById('repairReturnDate');
  if (returnDateEl) returnDateEl.value = nextWeek.toISOString().split('T')[0];
}

// File Tracking Search
function searchFileTracking() {
  const q = (document.getElementById('fileTrackingSearchInput')?.value || '').trim();
  if (!q) return;
  const qLower = q.toLowerCase();
  const resultDiv = document.getElementById('fileTrackingSearchResult');
  if (resultDiv) resultDiv.textContent = 'Searching...';

  let candidate = null;

  if (receivedItems.length) {
    const matches = receivedItems.filter(it => String(it.fileNumber || '').toLowerCase() === qLower);
    if (matches.length) {
      matches.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      candidate = matches[0];
    }
  }

  if (!candidate) {
    outer: for (const r of repairs) {
      for (const it of (r.items || [])) {
        if (it.fileNumber && String(it.fileNumber).toLowerCase() === qLower) {
          candidate = it;
          break outer;
        }
      }
    }
  }

  if (!candidate) {
    if (resultDiv) resultDiv.innerHTML = '<div class="text-danger">No data found for this file number.</div>';
    return;
  }

  const po = candidate.poNumber || '-';
  const invNo = candidate.invoiceNumber || '-';
  const url = candidate.invoiceUrl || candidate.invoice_url || null;

  let invoiceHtml = e(invNo);
  if (url) {
    const isImg = /\.(png|jpe?g|gif|webp)$/i.test(url);
    invoiceHtml += ` - ${isImg
      ? `<div><img src="${e(url)}" alt="Invoice" style="max-width:320px; border:1px solid #eee; margin-top:6px"></div>`
      : `<a href="${e(url)}" target="_blank" rel="noopener">Open invoice</a>`}`;
  }

  if (resultDiv) {
    resultDiv.innerHTML = `
      <div><strong>PO Number:</strong> ${e(po)}</div>
      <div><strong>Invoice:</strong> ${invoiceHtml}</div>
    `;
  }
}

/* =========================
   EDIT REPAIR: open + save
   ========================= */

// Build one editable item row (re-uses same classes as main/additional items)
function addEditItem(prefill = null) {
  const container = document.getElementById('editRepairItemsContainer');
  if (!container) return;

  const count = container.querySelectorAll('.edit-item').length + 1;
  const rowId = `edit-item-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'edit-item mb-3';
  wrapper.id = rowId;

  wrapper.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Item #${count}</h6>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditItem('${rowId}')">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="edit-item-content">
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
  `;

  container.appendChild(wrapper);

  // Bind select toggles
  bindRepairItemSelectToggles(wrapper);

  // Bind checkbox to enable/disable fields
  const chk = wrapper.querySelector('.item-received-check');
  const unitInput = wrapper.querySelector('.repair-unit-price');
  const qtyInput = wrapper.querySelector('.repair-quantity');

  chk.addEventListener('change', function () {
    const isChecked = this.checked;
    const content = wrapper.querySelector('.edit-item-content');
    content.querySelector('.repair-new-serial').disabled = !isChecked;
    content.querySelector('.repair-unit-price').disabled = !isChecked;
    content.querySelector('.repair-quantity').disabled = !isChecked;
    content.querySelector('.repair-total-price').removeAttribute('disabled');

    if (!isChecked) {
      content.querySelector('.repair-new-serial').value = '';
      content.querySelector('.repair-unit-price').value = '';
      content.querySelector('.repair-quantity').value = '1';
      content.querySelector('.repair-total-price').value = '';
    } else {
      // Ensure total reflects values
      calculateRepairTotal(unitInput || qtyInput);
    }
  });

  // Bind total calc
  unitInput.addEventListener('input', () => calculateRepairTotal(unitInput));
  qtyInput.addEventListener('input', () => calculateRepairTotal(qtyInput));

  // Prefill (if editing an existing item)
  if (prefill) {
    const itemNameRaw = (prefill.itemReplaced || prefill.itemName || '').toLowerCase().trim();
    const itemSelect = wrapper.querySelector('.repair-item-select');
    const options = Array.from(itemSelect.options).map(o => o.value);
    if (options.includes(itemNameRaw) && itemNameRaw !== '') {
      itemSelect.value = itemNameRaw;
    } else if (itemNameRaw) {
      itemSelect.value = 'other';
      const otherWrap = wrapper.querySelector('.repair-other-item-input');
      const otherInput = otherWrap.querySelector('input');
      otherWrap.style.display = 'block';
      otherInput.value = prefill.itemReplaced || prefill.itemName || '';
    }

    // Received + enable fields accordingly
    chk.checked = !!prefill.itemReceived;
    chk.dispatchEvent(new Event('change'));

    // Serial
    const serialSel = wrapper.querySelector('.repair-new-serial');
    serialSel.innerHTML = '<option value="" disabled>Select Serial Number</option>';
    if (prefill.newSerial) {
      const opt = document.createElement('option');
      opt.value = prefill.newSerial;
      opt.textContent = prefill.newSerial;
      serialSel.appendChild(opt);
      serialSel.value = prefill.newSerial;
    }

    // Old serial
    wrapper.querySelector('.repair-old-serial').value = prefill.oldSerial || '';

    // Prices
    if (prefill.unitPrice != null && prefill.unitPrice !== '') {
      wrapper.querySelector('.repair-unit-price').value = prefill.unitPrice;
    }
    wrapper.querySelector('.repair-quantity').value = prefill.quantity || 1;
    const total = prefill.totalPrice != null
      ? prefill.totalPrice
      : (parseNumber(prefill.unitPrice) * parseNumber(prefill.quantity || 1));
    wrapper.querySelector('.repair-total-price').value = Number(total || 0).toFixed(2);
  }
}

function removeEditItem(rowId) {
  const el = document.getElementById(rowId);
  if (!el) return;
  const container = el.parentElement;
  el.remove();
  // Renumber headers
  const rows = container.querySelectorAll('.edit-item');
  rows.forEach((r, idx) => {
    const h = r.querySelector('h6');
    if (h) h.textContent = `Item #${idx + 1}`;
  });
}

function renderEditItems(items) {
  const container = document.getElementById('editRepairItemsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    addEditItem(); // add one empty row
    return;
  }

  items.forEach(it => addEditItem(it));
}

// Gather items from Edit modal
function collectItemsFromEditModal() {
  const container = document.getElementById('editRepairItemsContainer');
  const rows = Array.from(container.querySelectorAll('.edit-item'));
  const items = [];
  let totalPrice = 0;

  rows.forEach(row => {
    const sel = row.querySelector('.repair-item-select');
    const otherInput = row.querySelector('.repair-other-item-input input');
    const itemName = sel?.value === 'other' ? (otherInput?.value || '') : (sel?.value || '');
    const received = !!row.querySelector('.item-received-check')?.checked;
    const newSerial = row.querySelector('.repair-new-serial')?.value || '';
    const oldSerial = row.querySelector('.repair-old-serial')?.value || '';
    const unitPrice = parseFloat(row.querySelector('.repair-unit-price')?.value || '0') || 0;
    const quantity = parseInt(row.querySelector('.repair-quantity')?.value || '1') || 1;
    const total = parseFloat(row.querySelector('.repair-total-price')?.value || '0') || (unitPrice * quantity);

    const hasData = !!(itemName || newSerial || oldSerial || unitPrice > 0 || quantity > 1);
    if (!hasData) return;

    const item = {
      itemReplaced: itemName || '',
      itemReceived: received,
      newSerial,
      oldSerial,
      unitPrice,
      quantity,
      totalPrice: total
    };

    // Enrich from inventory if received + newSerial present
    if (received && newSerial) {
      const inv = findReceivedItemBySerial(newSerial);
      if (inv) {
        item.invoiceNumber = inv.invoiceNumber || '';
        item.warrantyPeriod = inv.warrantyPeriod || '';
        item.supplier = inv.supplier || '';
        item.itemName = inv.itemName || item.itemReplaced || '';
        item.capacity = inv.capacity || null;
        item.fileNumber = inv.fileNumber || '';
        item.poNumber = inv.poNumber || '';
        item.invoiceUrl = inv.invoiceUrl || '';
      }
    }

    items.push(item);
    totalPrice += total;
  });

  return { items, totalPrice };
}

// Open Edit modal and populate fields
function openEditRepair(repairId) {
  const repair = repairs.find(r => r.id === repairId);
  if (!repair) {
    alert('Repair not found.');
    return;
  }
  editingRepairDocId = repairId;

  // Pre-fill fields
  document.getElementById('editRepairJobNumber').value = repair.jobNumber || '-';
  document.getElementById('editRepairEmployeeName').value = repair.employeeName || '';
  document.getElementById('editRepairPcSerial').value = repair.pcSerial || '';
  document.getElementById('editRepairGatePassNo').value = repair.gatePassNo || '';
  document.getElementById('editRepairErrorDetails').value = repair.errorDetails || '';
  document.getElementById('editRepairServiceDate').value = repair.serviceDate || '';
  document.getElementById('editRepairReturnDate').value = repair.returnDate || '';

  // Regions/Offices
  const editRegionEl = document.getElementById('editRepairRegion');
  const editDistrictEl = document.getElementById('editRepairDistrict');

  // Ensure region options are present
  populateRegionSelects();

  if (editRegionEl) {
    editRegionEl.value = repair.region || '';
  }
  // Populate districts based on region and preselect
  updateEditDistricts(repair.district || '');
  if (editDistrictEl && repair.district) editDistrictEl.value = repair.district;

  // Completed checkbox
  const chk = document.getElementById('editRepairCompleted');
  if (chk) chk.checked = !!repair.completed;

  // Render items into edit modal
  renderEditItems(repair.items || []);

  // If All Repairs modal open, hide it first to avoid stacking modals
  const listModalEl = document.getElementById('repairsModal');
  const listModal = bootstrap.Modal.getInstance(listModalEl);
  if (listModal) listModal.hide();

  // Show edit modal
  const modalEl = document.getElementById('editRepairModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

// Save updated repair (Customer Info, Error Details, Replaced Items, Service Dates, Status)
async function saveEditedRepair() {
  if (!editingRepairDocId) return;

  // Read values
  const employeeName = document.getElementById('editRepairEmployeeName').value.trim();
  const region = document.getElementById('editRepairRegion').value;
  const district = document.getElementById('editRepairDistrict').value;
  const pcSerial = document.getElementById('editRepairPcSerial').value.trim();
  const gatePassNo = document.getElementById('editRepairGatePassNo').value.trim();
  const errorDetails = document.getElementById('editRepairErrorDetails').value.trim();
  const serviceDate = document.getElementById('editRepairServiceDate').value;
  const returnDate = document.getElementById('editRepairReturnDate').value;
  const completed = document.getElementById('editRepairCompleted').checked;

  if (!employeeName || !region || !district || !pcSerial || !serviceDate || !returnDate) {
    alert('Please fill all required fields.');
    return;
  }

  const { items, totalPrice } = collectItemsFromEditModal();

  const saveBtn = document.getElementById('editRepairSaveBtn');
  const oldHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

  try {
    await db.collection('repairs').doc(editingRepairDocId).update({
      employeeName,
      region,
      district,
      pcSerial,
      gatePassNo,
      errorDetails,
      serviceDate,
      returnDate,
      items,
      totalPrice,
      completed,
      status: completed ? 'Completed' : 'In Progress'
    });

    // Close modal
    const modalEl = document.getElementById('editRepairModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    editingRepairDocId = null;
    alert('Repair updated successfully.');
  } catch (err) {
    console.error('Error updating repair:', err);
    alert('Error updating repair. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = oldHtml;
  }
}