// app.js

// --- Database Setup ---
const db = new Dexie("POSDB");
db.version(7).stores({
    products: '++id, code, name, category, retailPrice, wholesalePrice01, wholesalePrice02, stockQuantity, unit',
    sales: '++id, date, totalAmount, discount, customerType, customerId',
    customers: '++id, name, contact, totalDue',
    users: '++id, username, mobile, password, role, isActive',
    purchases: '++id, date, supplier, invoiceNo, totalAmount',
    categories: '++id, name',
    rawMaterials: '++id, name, stock, unit, minLevel',
    rawMaterialUsage: '++id, materialId, materialName, takenBy, quantity, date'
});

// --- State Variables ---
let currentUser = null; // Store logged-in user
let currentCart = [];
let pricingMode = 'retail'; // 'retail' or 'wholesale'
let selectedCustomerId = null;
let productsCache = [];
let customersCache = [];
let usersCache = [];
let purchasesCache = [];
let categoriesCache = [];
let rawMaterialsCache = [];
let usageHistoryCache = [];
let currentPOItems = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Update clock
    setInterval(() => {
        const now = new Date();
        document.getElementById('current-time').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    // Initialize Default Admin User if none exists
    const usersCount = await db.users.count();
    if (usersCount === 0) {
        await db.users.add({
            username: 'Admin',
            mobile: '0713171781',
            password: 'NAT@123',
            role: 'admin',
            isActive: true
        });
    }

    // Attach Login Handler
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Check if previously logged in (optional persistence, currently requiring login on refresh)
    // For now, always show login screen on reload
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');

    // Other Form handlers
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    document.getElementById('user-form').addEventListener('submit', saveUser);
    document.getElementById('raw-material-form').addEventListener('submit', saveRawMaterial);
    document.getElementById('reduce-raw-form').addEventListener('submit', saveUsage);
    document.getElementById('increase-raw-form').addEventListener('submit', saveIncrease);
    document.getElementById('cart-discount').addEventListener('input', updateCartUI);
    document.getElementById('cart-customer').addEventListener('change', (e) => {
        selectedCustomerId = e.target.value;
    });

    // Search handlers
    document.getElementById('pos-search').addEventListener('input', renderPOSGrid);
    document.getElementById('pos-category-filter').addEventListener('change', renderPOSGrid);
    document.getElementById('inv-search').addEventListener('input', renderInventoryGrid);
    document.getElementById('raw-search').addEventListener('input', renderRawMaterialsGrid);
});

// --- View Navigation ---
function switchView(viewId) {
    if (!currentUser) return; // Prevent navigation if not logged in

    // Admin check for users view
    if (viewId === 'users-view' && currentUser.role !== 'admin') {
        Swal.fire('Access Denied', 'Only administrators can access this section.', 'error');
        return;
    }

    // Hide all
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active-view');
        setTimeout(() => el.classList.add('hidden'), 400); // Wait for fade out
    });

    // Show selected
    setTimeout(() => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const activeView = document.getElementById(viewId);
        activeView.classList.remove('hidden');
        // small delay to allow display:block to apply before opacity transition
        setTimeout(() => activeView.classList.add('active-view'), 10);
    }, 400);

    // Update Nav Buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active', 'text-white');
        btn.classList.add('text-slate-400');
    });

    const activeBtn = document.querySelector(`.nav-btn[onclick="switchView('${viewId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'text-white');
        activeBtn.classList.remove('text-slate-400');
    }

    // Update Header Title
    const titles = {
        'pos-view': 'Point of Sale',
        'inventory-view': 'Inventory Management',
        'purchasing-view': 'Purchasing',
        'customers-view': 'Wholesale Customers',
        'raw-materials-view': 'Raw Material Stock',
        'reports-view': 'Reports & Analytics',
        'users-view': 'User Management'
    };
    document.getElementById('view-title').innerText = titles[viewId] || 'Dashboard';

    // Refresh data if needed based on view
    if (viewId === 'reports-view') loadReports();
    if (viewId === 'inventory-view') renderInventoryGrid();
    if (viewId === 'raw-materials-view') loadRawMaterials();
    if (viewId === 'customers-view') renderCustomersGrid();
    if (viewId === 'users-view') loadUsers();
    if (viewId === 'purchasing-view') loadPurchases();
}

// --- Authentication Logic ---
async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    const users = await db.users.toArray();
    const user = users.find(u =>
        (u.username === identifier || u.mobile === identifier) && u.password === password
    );

    if (user) {
        if (!user.isActive) {
            Swal.fire('Account Inactive', 'Your account has been deactivated. Please contact an administrator.', 'error');
            return;
        }

        currentUser = user;

        // Update UI
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('header-user-name').innerText = user.username;
        document.getElementById('header-user-role').innerText = user.role === 'admin' ? 'Administrator' : 'User';

        if (user.role === 'admin') {
            document.getElementById('nav-users').classList.remove('hidden');
        } else {
            document.getElementById('nav-users').classList.add('hidden');
        }

        // Initialize App Data
        await loadCategories();
        await loadProducts();
        await loadRawMaterials();
        await loadCustomers();
        await loadPurchases();
        await loadReports();

        switchView('pos-view');

        // Clear form
        document.getElementById('login-form').reset();
    } else {
        Swal.fire('Login Failed', 'Invalid username/mobile or password.', 'error');
    }
}

function handleLogout() {
    currentUser = null;
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');

    // Switch to POS view to reset state for next login
    switchView('pos-view');
}

// --- Data Loading & Rendering ---
async function loadCategories() {
    categoriesCache = await db.categories.toArray();
    // Default categories if empty
    if (categoriesCache.length === 0) {
        await db.categories.add({ name: 'Perfume' });
        await db.categories.add({ name: 'Essence' });
        categoriesCache = await db.categories.toArray();
    }

    // Update category dropdowns in UI
    const posFilter = document.getElementById('pos-category-filter');
    const prodSelect = document.getElementById('prod-category');

    if (posFilter) {
        posFilter.innerHTML = '<option value="all">All Categories</option>';
        categoriesCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.innerText = c.name;
            posFilter.appendChild(opt);
        });
    }

    if (prodSelect) {
        prodSelect.innerHTML = '';
        categoriesCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.innerText = c.name;
            prodSelect.appendChild(opt);
        });
        updateUnitLabel(); // update units for the first category
    }
}

async function loadProducts() {
    productsCache = await db.products.toArray();
    renderPOSGrid();
    renderInventoryGrid();
}

async function loadCustomers() {
    customersCache = await db.customers.toArray();

    // Update cart dropdown
    const select = document.getElementById('cart-customer');
    select.innerHTML = '<option value="">Select Wholesale Customer</option>';
    customersCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name;
        select.appendChild(opt);
    });

    renderCustomersGrid();
}

// --- POS Logic ---
function renderPOSGrid() {
    const grid = document.getElementById('pos-product-grid');
    const searchTerm = document.getElementById('pos-search').value.toLowerCase();
    const category = document.getElementById('pos-category-filter').value;

    grid.innerHTML = '';

    const filtered = productsCache.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm) || p.code.toLowerCase().includes(searchTerm);
        const matchesCat = category === 'all' || p.category === category;
        return matchesSearch && matchesCat;
    });

    filtered.forEach(p => {
        let price = p.retailPrice;
        if (pricingMode === 'wholesale01') price = p.wholesalePrice01 || p.wholesalePrice || 0;
        if (pricingMode === 'wholesale02') price = p.wholesalePrice02 || p.wholesalePrice || 0;

        const card = document.createElement('div');
        card.className = 'product-card bg-white rounded-xl border border-slate-200 p-4 cursor-pointer flex flex-col justify-between h-36';
        card.onclick = () => handleProductClick(p);

        const isLowStock = p.stockQuantity <= 5;
        const stockColor = isLowStock ? 'text-rose-500' : 'text-slate-400';

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-1">
                    <span class="text-xs font-semibold text-primary bg-indigo-50 px-2 py-0.5 rounded">${p.category}</span>
                    <span class="text-xs ${stockColor} font-medium">${p.stockQuantity} ${p.unit} left</span>
                </div>
                <h4 class="font-semibold text-slate-800 leading-tight">${p.name}</h4>
                <p class="text-xs text-slate-400 mt-1">${p.code}</p>
            </div>
            <div class="font-bold text-lg text-slate-800">
                Rs. ${parseFloat(price).toFixed(2)}
            </div>
        `;
        grid.appendChild(card);
    });
}

async function handleProductClick(product) {
    if (product.stockQuantity <= 0) {
        Swal.fire({ icon: 'error', title: 'Out of Stock', text: 'This item is currently out of stock.' });
        return;
    }

    addToCart(product, 1);
}

function addToCart(product, qty) {
    const existing = currentCart.find(item => item.product.id === product.id);

    if (existing) {
        if (existing.quantity + qty > product.stockQuantity) {
            Swal.fire({ icon: 'warning', title: 'Stock Limit', text: 'Cannot add more than available stock.', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            return;
        }
        existing.quantity += qty;
    } else {
        currentCart.push({ product, quantity: qty, discount: 0 });
    }

    updateCartUI();
}

function removeFromCart(productId) {
    currentCart = currentCart.filter(item => item.product.id !== productId);
    updateCartUI();
}

function updateCartItemQty(productId, qty) {
    const item = currentCart.find(i => i.product.id === productId);
    if (item) {
        const newQty = parseFloat(qty);
        if (newQty > item.product.stockQuantity) {
            Swal.fire({ icon: 'warning', title: 'Stock Limit', text: 'Insufficient stock.', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
            updateCartUI();
            return;
        }
        if (newQty <= 0) {
            removeFromCart(productId);
            return;
        }
        item.quantity = newQty;
        updateCartUI();
    }
}

function updateCartItemDiscount(productId, discount) {
    const item = currentCart.find(i => i.product.id === productId);
    if (item) {
        item.discount = parseFloat(discount) || 0;
        updateCartUI();
    }
}

function setPricingMode(mode) {
    pricingMode = mode;

    // UI update
    const btnRetail = document.getElementById('btn-retail');
    const btnWholesale01 = document.getElementById('btn-wholesale01');
    const btnWholesale02 = document.getElementById('btn-wholesale02');
    const custContainer = document.getElementById('customer-select-container');

    // Reset all buttons
    [btnRetail, btnWholesale01, btnWholesale02].forEach(btn => {
        btn.className = 'flex-1 py-1.5 text-sm font-medium rounded-md text-slate-500 hover:text-slate-800 transition-all';
    });

    if (mode === 'retail') {
        btnRetail.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-slate-800 transition-all';
        custContainer.style.display = 'none';
        selectedCustomerId = null;
        document.getElementById('cart-customer').value = "";
    } else {
        if (mode === 'wholesale01') {
            btnWholesale01.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-slate-800 transition-all';
        } else if (mode === 'wholesale02') {
            btnWholesale02.className = 'flex-1 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-slate-800 transition-all';
        }
        custContainer.style.display = 'block';
    }

    // Refresh grids and cart to show new prices
    renderPOSGrid();
    updateCartUI();
}

function clearCart() {
    currentCart = [];
    document.getElementById('cart-discount').value = 0;
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const emptyState = document.getElementById('cart-empty-state');
    const countBadge = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');

    if (!container || !emptyState) return;

    if (currentCart.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        countBadge.innerText = '0';
        subtotalEl.innerText = 'Rs. 0.00';
        totalEl.innerText = 'Rs. 0.00';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = '';

    let subtotal = 0;

    currentCart.forEach(item => {
        let price = item.product.retailPrice;
        if (pricingMode === 'wholesale01') price = item.product.wholesalePrice01 || item.product.wholesalePrice || 0;
        if (pricingMode === 'wholesale02') price = item.product.wholesalePrice02 || item.product.wholesalePrice || 0;
        const baseTotal = price * item.quantity;
        const itemDiscountAmt = baseTotal * (item.discount / 100);
        const itemTotal = baseTotal - itemDiscountAmt;
        subtotal += itemTotal;

        const row = document.createElement('div');
        row.className = 'flex flex-col py-3 border-b border-slate-100 last:border-0';
        row.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1 pr-2">
                    <h5 class="text-sm font-semibold text-slate-800 line-clamp-1">${item.product.name}</h5>
                    <p class="text-[10px] text-slate-400">Base: Rs. ${price.toFixed(2)}</p>
                </div>
                <div class="text-right">
                    <div class="text-sm font-bold text-slate-800">Rs. ${itemTotal.toFixed(2)}</div>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-1">
                    <span class="text-[9px] font-bold text-slate-400 uppercase">Qty</span>
                    <input type="number" value="${item.quantity}" min="1" step="any" onchange="updateCartItemQty(${item.product.id}, this.value)" 
                        class="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none focus:border-primary">
                </div>
                <div class="flex items-center gap-1">
                    <span class="text-[9px] font-bold text-slate-400 uppercase">Disc%</span>
                    <input type="number" value="${item.discount}" min="0" max="100" onchange="updateCartItemDiscount(${item.product.id}, this.value)" 
                        class="w-12 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none focus:border-primary">
                </div>
                <button onclick="removeFromCart(${item.product.id})" class="ml-auto text-slate-300 hover:text-rose-500 transition-colors">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });

    const discountPct = parseFloat(document.getElementById('cart-discount').value) || 0;
    const discountAmt = subtotal * (discountPct / 100);
    const total = subtotal - discountAmt;

    countBadge.innerText = currentCart.length;
    subtotalEl.innerText = `Rs. ${subtotal.toFixed(2)}`;
    totalEl.innerText = `Rs. ${total.toFixed(2)}`;
}

// --- Checkout & Printing ---
async function processCheckout() {
    if (currentCart.length === 0) {
        Swal.fire('Empty Cart', 'Please add items to cart before checkout.', 'warning');
        return;
    }

    if ((pricingMode === 'wholesale01' || pricingMode === 'wholesale02') && !selectedCustomerId) {
        Swal.fire('Customer Required', 'Please select a wholesale customer.', 'warning');
        return;
    }

    // Calculate totals
    let subtotal = 0;
    const itemsToSave = currentCart.map(item => {
        let price = item.product.retailPrice;
        if (pricingMode === 'wholesale01') price = item.product.wholesalePrice01 || item.product.wholesalePrice || 0;
        if (pricingMode === 'wholesale02') price = item.product.wholesalePrice02 || item.product.wholesalePrice || 0;
        const baseTotal = price * item.quantity;
        const itemDiscountAmt = baseTotal * (item.discount / 100);
        const itemTotal = baseTotal - itemDiscountAmt;
        subtotal += itemTotal;
        return {
            productId: item.product.id,
            name: item.product.name,
            price: price,
            quantity: item.quantity,
            discount: item.discount,
            unit: item.product.unit,
            total: itemTotal
        };
    });

    const discountPct = parseFloat(document.getElementById('cart-discount').value) || 0;
    const discountAmt = subtotal * (discountPct / 100);
    const finalTotal = subtotal - discountAmt;

    // Confirm Payment
    const { isConfirmed, value: paymentDetails } = await Swal.fire({
        title: 'Confirm Checkout',
        html: `
            <div style="font-size: 1.1rem; margin-bottom: 1rem; color: #334155;">Total amount: <strong style="color: #0f172a;">Rs. ${finalTotal.toFixed(2)}</strong></div>
            <div style="text-align: left; margin-bottom: 0.5rem;"><label style="font-size: 0.875rem; font-weight: 500; color: #475569;">Payment Method</label></div>
            <select id="payment-method" class="swal2-select" style="display: flex; width: 100%; margin: 0 0 1rem 0; font-size: 1rem;" onchange="document.getElementById('payment-ref-container').style.display = this.value === 'Cash' ? 'none' : 'block';">
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Mintpay">Mintpay</option>
                <option value="Payzy">Payzy</option>
                <option value="Bank Transfer">Bank Transfer</option>
            </select>
            <div id="payment-ref-container" style="display: none; text-align: left;">
                <label style="font-size: 0.875rem; font-weight: 500; color: #475569;">Reference Number (Optional)</label>
                <input id="payment-reference" class="swal2-input" placeholder="e.g. Transaction ID" style="display: flex; width: 100%; margin: 0.5rem 0 0 0; box-sizing: border-box;">
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Print Receipt & Complete',
        confirmButtonColor: '#4f46e5',
        preConfirm: () => {
            return {
                method: document.getElementById('payment-method').value,
                reference: document.getElementById('payment-reference').value
            }
        }
    });

    if (!isConfirmed) return;

    try {
        // Save Transaction
        const sale = {
            date: new Date().toISOString(),
            totalAmount: finalTotal,
            discount: discountAmt,
            customerType: pricingMode,
            customerId: selectedCustomerId,
            paymentMethod: paymentDetails.method,
            paymentReference: paymentDetails.reference,
            items: itemsToSave
        };

        const saleId = await db.sales.add(sale);

        // Update Stock
        for (const item of currentCart) {
            const product = await db.products.get(item.product.id);
            if (product) {
                await db.products.update(product.id, {
                    stockQuantity: product.stockQuantity - item.quantity
                });
            }
        }

        // Update Customer Credit (if wholesale and not paid full - assuming credit for now)
        if ((pricingMode === 'wholesale01' || pricingMode === 'wholesale02') && selectedCustomerId) {
            const customer = await db.customers.get(parseInt(selectedCustomerId));
            if (customer) {
                await db.customers.update(customer.id, {
                    totalDue: (customer.totalDue || 0) + finalTotal
                });
            }
        }

        // Generate Receipt and Print
        if (pricingMode === 'retail') {
            printReceipt(sale, saleId, subtotal, discountAmt, finalTotal);
        } else {
            // For wholesale, we can ask or just provide A4
            const { value: printType } = await Swal.fire({
                title: 'Print Invoice',
                text: 'Select the invoice format you want to print:',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'A4 Invoice (Wholesale)',
                denyButtonText: 'Thermal Receipt',
                showDenyButton: true,
                confirmButtonColor: '#4f46e5',
                denyButtonColor: '#64748b',
            });

            if (printType === true) {
                printWholesaleInvoiceA4(sale, saleId, subtotal, discountAmt, finalTotal);
            } else if (Swal.getDenyButton() && printType === false) {
                // Deny button was clicked
                printReceipt(sale, saleId, subtotal, discountAmt, finalTotal);
            }
        }

        // Reset
        clearCart();
        await loadProducts(); // Refresh stock
        if (pricingMode === 'wholesale01' || pricingMode === 'wholesale02') await loadCustomers(); // Refresh credit
        Swal.fire({ icon: 'success', title: 'Success', text: 'Transaction completed!', timer: 2000, showConfirmButton: false });

    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Failed to process transaction', 'error');
    }
}

function printReceipt(sale, saleId, subtotal, discountAmt, finalTotal) {
    const printArea = document.getElementById('receipt-print-area');
    printArea.classList.remove('a4-print'); // Ensure thermal sizing
    const dateStr = new Date(sale.date).toLocaleString();

    let itemsHtml = '';
    sale.items.forEach(item => {
        itemsHtml += `
            <tr>
                <td>
                    <div>${item.name}</div>
                    ${item.discount > 0 ? `<div style="font-size: 0.7rem; color: #666;">(Disc: ${item.discount}%)</div>` : ''}
                </td>
                <td style="text-align:right">${item.quantity}${item.unit}</td>
                <td style="text-align:right">${item.total.toFixed(2)}</td>
            </tr>
        `;
    });

    let customerInfo = '';
    if ((sale.customerType === 'wholesale01' || sale.customerType === 'wholesale02') && sale.customerId) {
        const customer = customersCache.find(c => c.id == sale.customerId);
        if (customer) {
            customerInfo = `<div class="receipt-details">Customer: ${customer.name}</div>`;
        }
    }

    printArea.innerHTML = `
        <div class="receipt-header">
            <h2 class="receipt-title">DORADO ESSENCE</h2>
            <div style="font-style: italic; margin-bottom: 5px;">Luxurious Fragrance</div>
            <div>Polonnaruwa, Sri Lanka</div>
            <div>Tel: +94763171781</div>
        </div>
        <div class="receipt-details">
            <div>Date: ${dateStr}</div>
            <div>Invoice No: INV-${saleId.toString().padStart(5, '0')}</div>
            <div>Type: ${sale.customerType.toUpperCase()}</div>
            <div>Payment: ${sale.paymentMethod || 'N/A'}</div>
            ${sale.paymentReference ? `<div>Ref: ${sale.paymentReference}</div>` : ''}
            ${customerInfo}
        </div>
        <table class="receipt-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th style="text-align:right">Qty</th>
                    <th style="text-align:right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div class="receipt-totals">
            <div style="display:flex; justify-content:space-between">
                <span>Subtotal:</span>
                <span>Rs. ${subtotal.toFixed(2)}</span>
            </div>
            ${discountAmt > 0 ? `
            <div style="display:flex; justify-content:space-between">
                <span>Discount:</span>
                <span>- Rs. ${discountAmt.toFixed(2)}</span>
            </div>` : ''}
            <div style="display:flex; justify-content:space-between; font-weight:bold; margin-top:5px;">
                <span>Total:</span>
                <span>Rs. ${finalTotal.toFixed(2)}</span>
            </div>
        </div>
        <div class="receipt-footer">
            <p>Thank you for your business!</p>
            <p>System By Suneth 0713507882</p>
        </div>
    `;

    window.print();
}

function printWholesaleInvoiceA4(sale, saleId, subtotal, discountAmt, finalTotal) {
    const printArea = document.getElementById('receipt-print-area');
    printArea.classList.add('a4-print');
    const dateStr = new Date(sale.date).toLocaleDateString();

    let itemsHtml = '';
    sale.items.forEach((item, index) => {
        itemsHtml += `
            <tr>
                <td style="width: 40px; text-align: center;">${index + 1}</td>
                <td>
                    <div style="font-weight: 600;">${item.name}</div>
                    <div style="font-size: 8pt; color: #64748b;">${item.unit} price: Rs. ${item.price.toFixed(2)}</div>
                </td>
                <td style="text-align: center;">${item.quantity} ${item.unit}</td>
                <td style="text-align: center;">${item.discount}%</td>
                <td style="text-align: right; font-weight: 600;">Rs. ${item.total.toFixed(2)}</td>
            </tr>
        `;
    });

    const customer = customersCache.find(c => c.id == sale.customerId);
    const customerName = customer ? customer.name : 'Walking Customer';
    const customerContact = customer ? customer.contact : 'N/A';

    printArea.innerHTML = `
        <div class="invoice-header">
            <div class="company-info">
                <h1>DORADO ESSENCE</h1>
                <p>Luxurious Fragrances</p>
                <p>Ethumalpitiya Junction, Polonnaruwa, Sri Lanka</p>
                <p>Hotline: +94 76 317 1781 | +94 71 317 1781</p>
                <p>Email: gofordoradoessence@gmail.com</p>
            </div>
            <div class="invoice-meta">
                <h2>INVOICE</h2>
                <p style="font-weight: 700; color: #4f46e5;">#INV-${saleId.toString().padStart(5, '0')}</p>
                <p>Date: ${dateStr}</p>
            </div>
        </div>

        <div class="billing-info">
            <div>
                <div class="info-label">Bill To:</div>
                <div class="info-value">
                    <strong style="font-size: 14pt;">${customerName}</strong><br>
                    Contact: ${customerContact}<br>
                    Customer ID: CUST-${sale.customerId || '000'}
                </div>
            </div>
            <div>
                <div class="info-label">Payment Information:</div>
                <div class="info-value">
                    Method: ${sale.paymentMethod}<br>
                    Reference: ${sale.paymentReference || 'None'}<br>
                    Status: <span style="color: #059669; font-weight: 700;">PROCESSED</span>
                </div>
            </div>
        </div>

        <table class="invoice-table">
            <thead>
                <tr>
                    <th style="width: 40px; text-align: center;">#</th>
                    <th>Product Description</th>
                    <th style="text-align: center;">Quantity</th>
                    <th style="text-align: center;">Disc%</th>
                    <th style="text-align: right;">Amount (LKR)</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="display: flex; justify-content: space-between;">
            <div style="width: 50%;">
                <div class="info-label">Terms & Conditions:</div>
                <p style="font-size: 8pt; color: #64748b; line-height: 1.5;">
                    1. Goods once sold are not returnable.<br>
                    2. Please check all items before leaving the premises.<br>
                    3. This is a computer-generated invoice.
                </p>
            </div>
            <div class="invoice-summary">
                <div class="summary-row">
                    <span>Subtotal</span>
                    <span>Rs. ${subtotal.toFixed(2)}</span>
                </div>
                <div class="summary-row">
                    <span>Discount Total</span>
                    <span style="color: #e11d48;">- Rs. ${discountAmt.toFixed(2)}</span>
                </div>
                <div class="summary-row total">
                    <span>Grand Total</span>
                    <span>Rs. ${finalTotal.toFixed(2)}</span>
                </div>
            </div>
        </div>

        <div class="signature-space">
            <div class="sig-box">Issued By</div>
            <div class="sig-box">Customer Signature</div>
        </div>

        <div class="invoice-footer">
            <p>Thank you for choosing Dorado Essence. We appreciate your business!</p>
            <p style="font-size: 7pt; margin-top: 10px;">System Powered by Suneth Tech Solutions | 071 350 7882</p>
        </div>
    `;

    setTimeout(() => {
        window.print();
    }, 500);
}


// --- Inventory Management ---
async function addCategory() {
    const { value: categoryName } = await Swal.fire({
        title: 'Add New Category',
        input: 'text',
        inputPlaceholder: 'Enter category name',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        inputValidator: (value) => {
            if (!value || !value.trim()) {
                return 'Please enter a category name!';
            }
        }
    });

    if (categoryName) {
        try {
            const exists = categoriesCache.find(c => c.name.toLowerCase() === categoryName.trim().toLowerCase());
            if (exists) {
                Swal.fire('Error', 'Category already exists', 'error');
                return;
            }
            await db.categories.add({ name: categoryName.trim() });
            Swal.fire({ icon: 'success', title: 'Added', text: 'Category added successfully', timer: 1500, showConfirmButton: false });
            await loadCategories();
        } catch (error) {
            Swal.fire('Error', 'Could not add category', 'error');
        }
    }
}

function updateUnitLabel() {
    const unitSelect = document.getElementById('prod-unit');
    unitSelect.innerHTML = '<option value="Bottles">Bottles</option><option value="Pcs">Pcs</option>';
}

function openProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');

    if (product) {
        document.getElementById('product-modal-title').innerText = 'Edit Product';
        document.getElementById('prod-id').value = product.id;
        document.getElementById('prod-code').value = product.code;
        document.getElementById('prod-name').value = product.name;
        document.getElementById('prod-category').value = product.category;
        updateUnitLabel();
        document.getElementById('prod-retail').value = product.retailPrice;
        document.getElementById('prod-wholesale01').value = product.wholesalePrice01 || product.wholesalePrice || 0;
        document.getElementById('prod-wholesale02').value = product.wholesalePrice02 || 0;
        document.getElementById('prod-stock').value = product.stockQuantity;
        document.getElementById('prod-unit').value = product.unit;
    } else {
        document.getElementById('product-modal-title').innerText = 'Add New Product';
        form.reset();
        document.getElementById('prod-id').value = '';
        updateUnitLabel();
    }

    modal.classList.remove('hidden');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
}

async function saveProduct(e) {
    e.preventDefault();

    const id = document.getElementById('prod-id').value;
    const productData = {
        code: document.getElementById('prod-code').value,
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        retailPrice: parseFloat(document.getElementById('prod-retail').value),
        wholesalePrice01: parseFloat(document.getElementById('prod-wholesale01').value),
        wholesalePrice02: parseFloat(document.getElementById('prod-wholesale02').value),
        stockQuantity: parseFloat(document.getElementById('prod-stock').value),
        unit: document.getElementById('prod-unit').value
    };

    try {
        if (id) {
            await db.products.update(parseInt(id), productData);
            Swal.fire({ icon: 'success', title: 'Updated', text: 'Product updated successfully', timer: 1500, showConfirmButton: false });
        } else {
            await db.products.add(productData);
            Swal.fire({ icon: 'success', title: 'Added', text: 'Product added successfully', timer: 1500, showConfirmButton: false });
        }
        closeProductModal();
        await loadProducts();
    } catch (error) {
        Swal.fire('Error', 'Could not save product', 'error');
    }
}

async function deleteProduct(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e63946',
        confirmButtonText: 'Yes, delete it!'
    });

    if (isConfirmed) {
        await db.products.delete(id);
        await loadProducts();
        Swal.fire('Deleted!', 'Product has been deleted.', 'success');
    }
}

function renderInventoryGrid() {
    const tbody = document.getElementById('inventory-table-body');
    const searchTerm = document.getElementById('inv-search').value.toLowerCase();

    tbody.innerHTML = '';

    const filtered = productsCache.filter(p => p.name.toLowerCase().includes(searchTerm) || p.code.toLowerCase().includes(searchTerm));

    filtered.forEach(p => {
        const isLowStock = p.stockQuantity <= 5;
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-4">${p.code}</td>
            <td class="p-4 font-medium text-slate-800">${p.name}</td>
            <td class="p-4"><span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">${p.category}</span></td>
            <td class="p-4">Rs. ${p.retailPrice.toFixed(2)}</td>
            <td class="p-4">Rs. ${(p.wholesalePrice01 || p.wholesalePrice || 0).toFixed(2)}</td>
            <td class="p-4">Rs. ${(p.wholesalePrice02 || 0).toFixed(2)}</td>
            <td class="p-4 ${isLowStock ? 'text-rose-600 font-bold' : ''}">${p.stockQuantity} ${p.unit}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteProduct(${p.id})" class="text-rose-500 hover:text-rose-700 mx-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Update Stats
    const totalItems = productsCache.length;
    const lowStockItems = productsCache.filter(p => p.stockQuantity <= 5).length;

    if (document.getElementById('inv-count-summary')) {
        document.getElementById('inv-count-summary').innerText = `Showing ${filtered.length} of ${totalItems} products`;
        document.getElementById('inv-stat-items').innerText = totalItems;
        document.getElementById('inv-stat-low').innerText = lowStockItems;
    }
}

function editProduct(id) {
    const product = productsCache.find(p => p.id === id);
    if (product) openProductModal(product);
}

// --- Customer Management ---
async function openCustomerModal() {
    const { value: formValues } = await Swal.fire({
        title: 'Add Wholesale Customer',
        html:
            '<input id="swal-input1" class="swal2-input" placeholder="Company/Name">' +
            '<input id="swal-input2" class="swal2-input" placeholder="Contact Number">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#d97706',
        preConfirm: () => {
            return [
                document.getElementById('swal-input1').value,
                document.getElementById('swal-input2').value
            ]
        }
    });

    if (formValues && formValues[0]) {
        try {
            await db.customers.add({
                name: formValues[0],
                contact: formValues[1],
                totalDue: 0
            });
            await loadCustomers();
            Swal.fire('Added!', 'Customer has been added.', 'success');
        } catch (error) {
            Swal.fire('Error', 'Could not add customer', 'error');
        }
    }
}

async function payCustomerCredit(id, currentDue) {
    const { value: amount } = await Swal.fire({
        title: 'Record Payment',
        input: 'number',
        inputLabel: `Current Due: Rs. ${currentDue.toFixed(2)}`,
        inputPlaceholder: 'Enter amount paid',
        showCancelButton: true,
        confirmButtonColor: '#10b981'
    });

    if (amount) {
        const val = parseFloat(amount);
        if (val > 0) {
            const newDue = Math.max(0, currentDue - val);
            await db.customers.update(id, { totalDue: newDue });
            await loadCustomers();
            Swal.fire('Success', 'Payment recorded successfully', 'success');
        }
    }
}

function renderCustomersGrid() {
    const tbody = document.getElementById('customers-table-body');
    tbody.innerHTML = '';

    customersCache.forEach(c => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-4 font-medium text-slate-800">${c.name}</td>
            <td class="p-4">${c.contact}</td>
            <td class="p-4 font-bold ${c.totalDue > 0 ? 'text-rose-600' : 'text-emerald-600'}">Rs. ${c.totalDue.toFixed(2)}</td>
            <td class="p-4 text-center">
                ${c.totalDue > 0 ? `<button onclick="payCustomerCredit(${c.id}, ${c.totalDue})" class="px-3 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded text-xs font-semibold">Record Pay</button>` : '<span class="text-xs text-slate-400">Settled</span>'}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// --- Reports ---
async function loadReports() {
    const sales = await db.sales.orderBy('date').reverse().toArray();

    let totalRevenue = 0;
    sales.forEach(s => totalRevenue += s.totalAmount);

    document.getElementById('report-total-sales').innerText = `Rs. ${totalRevenue.toFixed(2)}`;
    document.getElementById('report-invoice-count').innerText = sales.length;

    const lowStock = productsCache.filter(p => p.stockQuantity <= 5).length;
    document.getElementById('report-low-stock').innerText = lowStock;

    const tbody = document.getElementById('transactions-table-body');
    tbody.innerHTML = '';

    sales.slice(0, 50).forEach(s => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-3 text-slate-500">${new Date(s.date).toLocaleString()}</td>
            <td class="p-3 font-medium">INV-${s.id.toString().padStart(5, '0')}</td>
            <td class="p-3"><span class="px-2 py-1 bg-slate-100 rounded text-xs">${s.customerType}</span></td>
            <td class="p-3"><span class="text-xs font-medium text-slate-600">${s.paymentMethod || '-'}</span></td>
            <td class="p-3 text-right font-bold text-slate-800">Rs. ${s.totalAmount.toFixed(2)}</td>
            <td class="p-3 text-right">
                <button onclick="reprintSale(${s.id})" class="text-primary hover:text-indigo-800 p-1" title="Print Invoice">
                    <i class="fa-solid fa-print"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function reprintSale(id) {
    const sale = await db.sales.get(id);
    if (!sale) return;

    const subtotal = sale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmt = sale.discount || 0;
    const finalTotal = sale.totalAmount;

    if (sale.customerType === 'retail') {
        printReceipt(sale, sale.id, subtotal, discountAmt, finalTotal);
    } else {
        const { value: printType } = await Swal.fire({
            title: 'Reprint Invoice',
            text: 'Select the invoice format:',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'A4 Invoice',
            denyButtonText: 'Thermal Receipt',
            showDenyButton: true,
            confirmButtonColor: '#4f46e5',
            denyButtonColor: '#64748b',
        });

        if (printType === true) {
            printWholesaleInvoiceA4(sale, sale.id, subtotal, discountAmt, finalTotal);
        } else if (Swal.getDenyButton() && printType === false) {
            printReceipt(sale, sale.id, subtotal, discountAmt, finalTotal);
        }
    }
}


// --- User Management ---
async function loadUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;
    usersCache = await db.users.toArray();
    renderUsersGrid();
}

function renderUsersGrid() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    usersCache.forEach(u => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-4 font-medium text-slate-800">${u.username}</td>
            <td class="p-4 text-slate-600">${u.mobile}</td>
            <td class="p-4"><span class="px-2 py-1 bg-slate-100 rounded text-xs capitalize">${u.role}</span></td>
            <td class="p-4">
                <button onclick="toggleUserStatus(${u.id})" class="px-3 py-1 rounded text-xs font-semibold ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                    ${u.isActive ? 'Active' : 'Inactive'}
                </button>
            </td>
            <td class="p-4 text-center">
                <button onclick="editUser(${u.id})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteUser(${u.id})" class="text-rose-500 hover:text-rose-700 mx-1 ${u.id === currentUser.id ? 'opacity-50 cursor-not-allowed' : ''}" ${u.id === currentUser.id ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editUser(id) {
    const user = usersCache.find(u => u.id === id);
    if (user) openUserModal(user);
}

function openUserModal(user = null) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const pwdHelp = document.getElementById('user-password-help');
    const pwdInput = document.getElementById('user-password');

    form.reset();

    if (user) {
        document.getElementById('user-modal-title').innerText = 'Edit User';
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-mobile').value = user.mobile;
        document.getElementById('user-role').value = user.role;
        pwdInput.required = false;
        pwdHelp.style.display = 'block';
    } else {
        document.getElementById('user-modal-title').innerText = 'Add New User';
        document.getElementById('user-id').value = '';
        pwdInput.required = true;
        pwdHelp.style.display = 'none';
    }

    modal.classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

async function saveUser(e) {
    e.preventDefault();

    const id = document.getElementById('user-id').value;
    const username = document.getElementById('user-username').value.trim();
    const mobile = document.getElementById('user-mobile').value.trim();
    const role = document.getElementById('user-role').value;
    const password = document.getElementById('user-password').value;

    try {
        if (id) {
            const existing = await db.users.get(parseInt(id));
            const updateData = { username, mobile, role };
            if (password) updateData.password = password; // Only update password if provided

            await db.users.update(parseInt(id), updateData);
            Swal.fire({ icon: 'success', title: 'Updated', text: 'User updated successfully', timer: 1500, showConfirmButton: false });
        } else {
            await db.users.add({ username, mobile, password, role, isActive: true });
            Swal.fire({ icon: 'success', title: 'Added', text: 'User added successfully', timer: 1500, showConfirmButton: false });
        }
        closeUserModal();
        await loadUsers();
    } catch (error) {
        Swal.fire('Error', 'Could not save user', 'error');
    }
}

async function deleteUser(id) {
    if (id === currentUser.id) {
        Swal.fire('Error', 'You cannot delete your own account.', 'error');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'Delete User?',
        text: "This action cannot be undone!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e63946',
        confirmButtonText: 'Yes, delete it!'
    });

    if (isConfirmed) {
        await db.users.delete(id);
        await loadUsers();
        Swal.fire('Deleted!', 'User has been deleted.', 'success');
    }
}

async function toggleUserStatus(id) {
    if (id === currentUser.id) {
        Swal.fire('Error', 'You cannot change your own active status.', 'error');
        return;
    }

    const user = await db.users.get(id);
    if (user) {
        await db.users.update(id, { isActive: !user.isActive });
        await loadUsers();
    }
}

// --- Purchasing Management ---
async function loadPurchases() {
    purchasesCache = await db.purchases.orderBy('date').reverse().toArray();
    renderPurchasesGrid();
}

function renderPurchasesGrid() {
    const tbody = document.getElementById('purchasing-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    purchasesCache.forEach(p => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-4">${new Date(p.date).toLocaleString()}</td>
            <td class="p-4 font-medium text-slate-800">${p.supplier}</td>
            <td class="p-4">${p.invoiceNo}</td>
            <td class="p-4 font-bold text-slate-800">Rs. ${parseFloat(p.totalAmount).toFixed(2)}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">${p.paymentMethod || '-'}</span>
                ${p.paymentDate ? `<div class="text-[10px] text-slate-400 mt-1">${new Date(p.paymentDate).toLocaleDateString()}</div>` : ''}
            </td>
            <td class="p-4 text-center">
                <button onclick="reprintPO(${p.id})" class="px-3 py-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded text-xs font-semibold"><i class="fa-solid fa-print"></i> Print</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function reprintPO(id) {
    const po = purchasesCache.find(p => p.id === id);
    if (po) printPurchaseOrder(po, po.id);
}

function openPOModal() {
    currentPOItems = [];
    document.getElementById('po-form').reset();
    document.getElementById('po-date').valueAsDate = new Date();
    document.getElementById('po-payment-date').valueAsDate = new Date();
    renderPOItems();
    document.getElementById('po-modal').classList.remove('hidden');
}

function closePOModal() {
    document.getElementById('po-modal').classList.add('hidden');
}

function addPOItem() {
    const itemInput = document.getElementById('po-item-name');
    const qtyInput = document.getElementById('po-item-qty');
    const priceInput = document.getElementById('po-item-price');

    const item = itemInput.value.trim();
    const qty = parseFloat(qtyInput.value);
    const price = parseFloat(priceInput.value);

    if (!item || isNaN(qty) || isNaN(price) || qty <= 0 || price < 0) {
        Swal.fire('Error', 'Please enter valid item name, quantity, and price.', 'error');
        return;
    }

    currentPOItems.push({ item, qty, price, total: qty * price });

    // clear inputs
    itemInput.value = '';
    qtyInput.value = '';
    priceInput.value = '';
    itemInput.focus();

    renderPOItems();
}

function removePOItem(index) {
    currentPOItems.splice(index, 1);
    renderPOItems();
}

function renderPOItems() {
    const tbody = document.getElementById('po-items-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let subtotal = 0;

    currentPOItems.forEach((p, index) => {
        subtotal += p.total;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="py-2 text-sm">${p.item}</td>
            <td class="py-2 text-sm text-right">${p.qty}</td>
            <td class="py-2 text-sm text-right">${p.price.toFixed(2)}</td>
            <td class="py-2 text-sm text-right font-medium">${p.total.toFixed(2)}</td>
            <td class="py-2 text-center">
                <button type="button" onclick="removePOItem(${index})" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-xmark"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('po-total').innerText = `Rs. ${subtotal.toFixed(2)}`;
}

async function savePurchaseOrder(e) {
    e.preventDefault();

    if (currentPOItems.length === 0) {
        Swal.fire('Empty PO', 'Please add at least one item to the purchase order.', 'warning');
        return;
    }

    const date = document.getElementById('po-date').value;
    const supplier = document.getElementById('po-supplier').value.trim();
    const invoiceNo = document.getElementById('po-invoice').value.trim();
    const paymentMethod = document.getElementById('po-payment-method').value;
    const paymentDate = document.getElementById('po-payment-date').value;

    const totalAmount = currentPOItems.reduce((sum, item) => sum + item.total, 0);

    const po = {
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        supplier,
        invoiceNo,
        paymentMethod,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : null,
        items: [...currentPOItems],
        totalAmount
    };

    try {
        const poId = await db.purchases.add(po);
        await loadPurchases();

        closePOModal();
        Swal.fire({ icon: 'success', title: 'Saved!', text: 'Purchase order saved successfully.', timer: 1500, showConfirmButton: false });

        printPurchaseOrder(po, poId);
    } catch (error) {
        Swal.fire('Error', 'Could not save purchase order.', 'error');
    }
}

function printPurchaseOrder(po, poId) {
    const printArea = document.getElementById('receipt-print-area');
    printArea.classList.add('a4-print'); // Use A4 sizing
    const dateStr = new Date(po.date).toLocaleDateString();

    let itemsHtml = '';
    po.items.forEach(item => {
        itemsHtml += `
            <tr>
                <td>${item.item}</td>
                <td style="text-align:right">${item.qty}</td>
                <td style="text-align:right">${item.price.toFixed(2)}</td>
                <td style="text-align:right">${item.total.toFixed(2)}</td>
            </tr>
        `;
    });

    printArea.innerHTML = `
        <div class="receipt-header" style="text-align:center; margin-bottom: 20px;">
            <h2 style="margin:0; font-size: 24px;">PURCHASE ORDER</h2>
            <div style="font-weight:bold; font-size:18px;">DORADO ESSENCE</div>
        </div>
        <div class="receipt-details" style="display:flex; justify-content:space-between; margin-bottom: 20px;">
            <div>
                <div><strong>Supplier:</strong> ${po.supplier}</div>
                <div><strong>Invoice No:</strong> ${po.invoiceNo}</div>
                <div><strong>Payment:</strong> ${po.paymentMethod} ${po.paymentDate ? `(${new Date(po.paymentDate).toLocaleDateString()})` : ''}</div>
            </div>
            <div style="text-align:right;">
                <div><strong>Date:</strong> ${dateStr}</div>
                <div><strong>PO No:</strong> PO-${poId.toString().padStart(5, '0')}</div>
            </div>
        </div>
        <table class="receipt-table" style="width:100%; border-collapse:collapse; margin-bottom: 20px;">
            <thead>
                <tr style="border-bottom: 2px solid #000;">
                    <th style="text-align:left; padding:5px 0;">Item</th>
                    <th style="text-align:right; padding:5px 0;">Qty</th>
                    <th style="text-align:right; padding:5px 0;">Unit Price</th>
                    <th style="text-align:right; padding:5px 0;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div class="receipt-totals" style="text-align:right; font-size: 18px;">
            <div style="font-weight:bold; border-top: 2px solid #000; padding-top: 5px; display:inline-block; min-width: 200px;">
                Total: Rs. ${po.totalAmount.toFixed(2)}
            </div>
        </div>
        <div style="margin-top: 50px; display:flex; justify-content:space-between;">
            <div style="border-top: 1px solid #000; padding-top: 5px; width: 200px; text-align:center;">Authorized Signature</div>
            <div style="border-top: 1px solid #000; padding-top: 5px; width: 200px; text-align:center;">Supplier Signature</div>
        </div>
    `;

    window.print();
}

function printPurchasingReport() {
    const startDate = document.getElementById('purchasing-filter-start').value;
    const endDate = document.getElementById('purchasing-filter-end').value;

    let filtered = purchasesCache;

    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(p => new Date(p.date) >= start);
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(p => new Date(p.date) <= end);
    }

    if (filtered.length === 0) {
        Swal.fire('No Data', 'There are no purchase records for the selected period.', 'info');
        return;
    }

    const printArea = document.getElementById('receipt-print-area');
    printArea.classList.add('a4-print'); // Use A4 sizing

    let totalPurchases = 0;
    let itemsHtml = '';

    filtered.forEach(po => {
        totalPurchases += po.totalAmount;
        itemsHtml += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(po.date).toLocaleDateString()}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">PO-${po.id.toString().padStart(5, '0')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${po.supplier}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${po.invoiceNo}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${po.paymentMethod || '-'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align:right;">${po.totalAmount.toFixed(2)}</td>
            </tr>
        `;
    });

    const reportTitle = startDate && endDate
        ? `PURCHASING REPORT (${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()})`
        : 'PURCHASING REPORT';

    printArea.innerHTML = `
        <div style="text-align:center; margin-bottom: 30px;">
            <h2 style="margin:0; font-size: 24px;">${reportTitle}</h2>
            <div style="font-weight:bold; font-size:18px;">DORADO ESSENCE</div>
            <div style="margin-top: 5px; color: #555;">Generated on ${new Date().toLocaleString()}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom: 30px; font-size: 14px;">
            <thead>
                <tr style="background-color: #f8f9fa;">
                    <th style="text-align:left; padding: 10px 8px; border-bottom: 2px solid #333;">Date</th>
                    <th style="text-align:left; padding: 10px 8px; border-bottom: 2px solid #333;">PO Number</th>
                    <th style="text-align:left; padding: 10px 8px; border-bottom: 2px solid #333;">Supplier</th>
                    <th style="text-align:left; padding: 10px 8px; border-bottom: 2px solid #333;">Invoice No</th>
                    <th style="text-align:left; padding: 10px 8px; border-bottom: 2px solid #333;">Payment</th>
                    <th style="text-align:right; padding: 10px 8px; border-bottom: 2px solid #333;">Amount (Rs.)</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div style="text-align:right; font-size: 18px;">
            <div style="font-weight:bold; display:inline-block; padding: 10px 20px; background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">
                Total Purchases: Rs. ${totalPurchases.toFixed(2)}
            </div>
        </div>
    `;

    window.print();
}

// --- Raw Materials Management ---
async function loadRawMaterials() {
    rawMaterialsCache = await db.rawMaterials.toArray();
    renderRawMaterialsGrid();
}

function renderRawMaterialsGrid() {
    const tbody = document.getElementById('raw-materials-table-body');
    const searchTerm = (document.getElementById('raw-search')?.value || '').toLowerCase();

    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = rawMaterialsCache.filter(m => m.name.toLowerCase().includes(searchTerm));

    filtered.forEach(m => {
        const isLowStock = m.stock <= m.minLevel;
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-4 font-medium text-slate-800">${m.name}</td>
            <td class="p-4 ${isLowStock ? 'text-rose-600 font-bold' : ''}">${parseFloat(m.stock).toFixed(2)}</td>
            <td class="p-4 text-slate-500">${m.unit}</td>
            <td class="p-4 text-slate-400">${parseFloat(m.minLevel).toFixed(2)}</td>
            <td class="p-4 text-center">
                <button onclick="openIncreaseModal(${m.id})" class="text-emerald-600 hover:text-emerald-800 mx-1" title="Add Stock"><i class="fa-solid fa-plus-circle"></i></button>
                <button onclick="openReduceModal(${m.id})" class="text-rose-600 hover:text-rose-800 mx-1" title="Reduce Stock"><i class="fa-solid fa-minus-circle"></i></button>
                <button onclick="editRawMaterial(${m.id})" class="text-blue-500 hover:text-blue-700 mx-1" title="Edit Record"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteRawMaterial(${m.id})" class="text-slate-300 hover:text-rose-700 mx-1" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Update Stats
    const totalTypes = rawMaterialsCache.length;
    const lowStockCount = rawMaterialsCache.filter(m => m.stock <= m.minLevel).length;

    if (document.getElementById('raw-count-summary')) {
        document.getElementById('raw-count-summary').innerText = `Showing ${filtered.length} of ${totalTypes} materials`;
        document.getElementById('raw-stat-items').innerText = totalTypes;
        document.getElementById('raw-stat-low').innerText = lowStockCount;
    }
}

function openRawMaterialModal(material = null) {
    const modal = document.getElementById('raw-material-modal');
    const form = document.getElementById('raw-material-form');

    if (material) {
        document.getElementById('raw-modal-title').innerText = 'Edit Raw Material';
        document.getElementById('raw-id').value = material.id;
        document.getElementById('raw-name').value = material.name;
        document.getElementById('raw-stock').value = material.stock;
        document.getElementById('raw-unit').value = material.unit;
        document.getElementById('raw-min-level').value = material.minLevel;
    } else {
        document.getElementById('raw-modal-title').innerText = 'Add Raw Material';
        form.reset();
        document.getElementById('raw-id').value = '';
    }

    modal.classList.remove('hidden');
}

function closeRawMaterialModal() {
    document.getElementById('raw-material-modal').classList.add('hidden');
}

async function saveRawMaterial(e) {
    e.preventDefault();

    const id = document.getElementById('raw-id').value;
    const data = {
        name: document.getElementById('raw-name').value.trim(),
        stock: parseFloat(document.getElementById('raw-stock').value),
        unit: document.getElementById('raw-unit').value.trim(),
        minLevel: parseFloat(document.getElementById('raw-min-level').value)
    };

    try {
        if (id) {
            await db.rawMaterials.update(parseInt(id), data);
            Swal.fire({ icon: 'success', title: 'Updated', text: 'Material updated successfully', timer: 1500, showConfirmButton: false });
        } else {
            await db.rawMaterials.add(data);
            Swal.fire({ icon: 'success', title: 'Added', text: 'Material added successfully', timer: 1500, showConfirmButton: false });
        }
        closeRawMaterialModal();
        await loadRawMaterials();
    } catch (error) {
        Swal.fire('Error', 'Could not save material', 'error');
    }
}

async function deleteRawMaterial(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Are you sure?',
        text: "Remove this raw material from records?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e63946',
        confirmButtonText: 'Yes, delete it!'
    });

    if (isConfirmed) {
        await db.rawMaterials.delete(id);
        await loadRawMaterials();
        Swal.fire('Deleted!', 'Material record removed.', 'success');
    }
}

function editRawMaterial(id) {
    const material = rawMaterialsCache.find(m => m.id === id);
    if (material) openRawMaterialModal(material);
}

// --- Usage Tracking Logic ---
function openReduceModal(id) {
    const material = rawMaterialsCache.find(m => m.id === id);
    if (!material) return;

    document.getElementById('reduce-raw-id').value = material.id;
    document.getElementById('reduce-raw-name-display').value = material.name;
    document.getElementById('reduce-raw-unit-display').innerText = material.unit;
    document.getElementById('reduce-raw-stock-hint').innerText = `Available: ${material.stock} ${material.unit}`;
    document.getElementById('reduce-raw-qty').value = '';
    document.getElementById('reduce-raw-person').value = '';

    document.getElementById('reduce-raw-modal').classList.remove('hidden');
}

function closeReduceModal() {
    document.getElementById('reduce-raw-modal').classList.add('hidden');
}

async function saveUsage(e) {
    e.preventDefault();

    const id = parseInt(document.getElementById('reduce-raw-id').value);
    const takenBy = document.getElementById('reduce-raw-person').value.trim();
    const qty = parseFloat(document.getElementById('reduce-raw-qty').value);

    const material = rawMaterialsCache.find(m => m.id === id);
    if (!material) return;

    if (qty > material.stock) {
        Swal.fire('Insufficient Stock', `Only ${material.stock} ${material.unit} available.`, 'error');
        return;
    }

    try {
        // 1. Update Stock
        await db.rawMaterials.update(id, {
            stock: material.stock - qty
        });

        // 2. Add Usage Log
        await db.rawMaterialUsage.add({
            materialId: id,
            materialName: material.name,
            takenBy: takenBy,
            quantity: -qty, // Store as negative for usage/reduction
            unit: material.unit,
            date: new Date().toISOString()
        });

        Swal.fire({ icon: 'success', title: 'Recorded', text: 'Usage recorded and stock updated.', timer: 2000, showConfirmButton: false });
        closeReduceModal();
        await loadRawMaterials();
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Could not record usage', 'error');
    }
}

function openIncreaseModal(id) {
    const material = rawMaterialsCache.find(m => m.id === id);
    if (!material) return;

    document.getElementById('increase-raw-id').value = material.id;
    document.getElementById('increase-raw-name-display').value = material.name;
    document.getElementById('increase-raw-unit-display').innerText = material.unit;
    document.getElementById('increase-raw-qty').value = '';
    document.getElementById('increase-raw-person').value = '';

    document.getElementById('increase-raw-modal').classList.remove('hidden');
}

function closeIncreaseModal() {
    document.getElementById('increase-raw-modal').classList.add('hidden');
}

async function saveIncrease(e) {
    e.preventDefault();

    const id = parseInt(document.getElementById('increase-raw-id').value);
    const person = document.getElementById('increase-raw-person').value.trim();
    const qty = parseFloat(document.getElementById('increase-raw-qty').value);

    const material = rawMaterialsCache.find(m => m.id === id);
    if (!material) return;

    try {
        // 1. Update Stock
        await db.rawMaterials.update(id, {
            stock: material.stock + qty
        });

        // 2. Add Log (using positive quantity to distinguish from usage)
        await db.rawMaterialUsage.add({
            materialId: id,
            materialName: material.name,
            takenBy: person, // Using the same field for "Received By"
            quantity: qty, // Positive value
            unit: material.unit,
            date: new Date().toISOString()
        });

        Swal.fire({ icon: 'success', title: 'Updated', text: 'Stock increased successfully.', timer: 2000, showConfirmButton: false });
        closeIncreaseModal();
        await loadRawMaterials();
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Could not increase stock', 'error');
    }
}

async function viewUsageLog() {
    usageHistoryCache = await db.rawMaterialUsage.reverse().toArray();
    renderUsageLog();
    document.getElementById('usage-log-modal').classList.remove('hidden');
}

function renderUsageLog() {
    const tbody = document.getElementById('usage-log-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    usageHistoryCache.forEach(log => {
        const isIncrease = log.quantity > 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-3 text-slate-500">${new Date(log.date).toLocaleString()}</td>
            <td class="p-3 font-medium text-slate-800">${log.materialName}</td>
            <td class="p-3">${log.takenBy}</td>
            <td class="p-3 text-right font-bold ${isIncrease ? 'text-emerald-600' : 'text-rose-600'}">
                ${isIncrease ? '+' : ''}${log.quantity} ${log.unit || ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function closeUsageLog() {
    document.getElementById('usage-log-modal').classList.add('hidden');
}

// --- Export Backup ---
async function exportData() {
    try {
        const data = {
            products: await db.products.toArray(),
            sales: await db.sales.toArray(),
            customers: await db.customers.toArray(),
            users: await db.users.toArray(),
            purchases: await db.purchases.toArray(),
            rawMaterials: await db.rawMaterials.toArray()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `DoradoPOS_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Swal.fire({ icon: 'success', title: 'Backup Successful', text: 'Data exported as JSON file.', timer: 2000, showConfirmButton: false });
    } catch (error) {
        Swal.fire('Error', 'Failed to export data', 'error');
    }
}
