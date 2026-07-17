/* =========================================
   1. CONFIGURATION & AUTH CHECK
   ========================================= */
const API_URL = "http://localhost:5000"; // Fixed port to match server

const token = localStorage.getItem("cashen_token");
const currentUserEmail = localStorage.getItem("cashen_user_email");
const currentUserName = localStorage.getItem("cashen_user_name");

if (!token) {
  const path = window.location.pathname;
  const isAuthPage = path.includes("login.html") || path.includes("register.html");
  if (!isAuthPage) window.location.href = "login.html";
}

/* =========================================
   2. MAIN STATE & CURRENCY CONFIG
   ========================================= */
const CURRENCY_MAP = {
  "₹": "INR",
  "$": "USD",
  "€": "EUR",
  "£": "GBP"
};

const BASE_CURRENCY_CODE = "INR";

let Data = {
  currentViewDate: new Date(),
  privacyMode: true,
  theme: localStorage.getItem("cashen_theme") || "light",
  transactions: [],
  budgets: {},
  loans: [],
  goals: [],
  categories: ["Salary", "Business", "Food", "Travel", "Bills", "Rent", "Shopping", "Health", "Entertainment"],

  rates: {},
  lastRateFetch: 0,
  pendingUpdate: null,
  confirmCallback: null,
};

/* =========================================
   3. APP LOGIC
   ========================================= */
const App = {
  async init() {
    if (!token) return;
    document.documentElement.setAttribute("data-theme", Data.theme);

    // Fixed default date to local timezone
    if (document.getElementById("date")) {
      document.getElementById("date").value = this.formatDate(new Date());
    }

    await this.fetchExchangeRates();

    try {
      const res = await fetch(`${API_URL}/dashboard-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const serverData = await res.json();

        // Fixed Constructor Bug (Direct assignment)
        Data.transactions = serverData.transactions;
        Data.budgets = serverData.budgets;
        Data.loans = serverData.loans;
        Data.goals = serverData.goals;

        this.renderDashboard();
      } else {
        Auth.logout();
      }
    } catch (err) {
      console.error(err);
    }
  },

  /* --- FIX LOCAL DATE OFFSETS --- */
  formatDate(dateInput) {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  },

  async fetchExchangeRates() {
    const cached = localStorage.getItem('cashen_rates');
    const cachedTime = localStorage.getItem('cashen_rates_time');
    const now = Date.now();

    if (cached && cachedTime && (now - cachedTime < 3600000)) {
      Data.rates = JSON.parse(cached);
      return;
    }

    try {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY_CODE}`);
      const data = await res.json();
      Data.rates = data.rates;
      localStorage.setItem('cashen_rates', JSON.stringify(data.rates));
      localStorage.setItem('cashen_rates_time', now);
    } catch (err) {
      Data.rates = { INR: 1, USD: 1, EUR: 1, GBP: 1 };
    }
  },

  /* --- TRANSACTIONS --- */
  addTransaction(e) {
    e.preventDefault();
    const txData = {
      description: document.getElementById("desc").value,
      amount: Math.abs(parseFloat(document.getElementById("amount").value)),
      type: document.getElementById("transType").value,
      category: document.getElementById("categorySelect").value,
      date: document.getElementById("date").value,
    };
    this.apiCall("/transactions", "POST", txData, (savedTx) => {
      Data.transactions.unshift(savedTx); // Add to beginning of array
      UI.closeModals();
      this.refreshCurrentView();
      UI.showAlert("Success", "Transaction added!");
    });
  },

  /* --- BUDGETS --- */
  saveBudget(e) {
    e.preventDefault();
    const category = document.getElementById("budgetCatSelect").value;
    const limit = document.getElementById("budgetAmount").value;
    this.apiCall("/budgets", "POST", { category, limit_amount: limit }, () => {
      Data.budgets[category] = Number(limit);
      UI.closeModals();
      this.renderBudgetsPage();
      UI.showAlert("Success", `Budget updated for ${category}`);
    });
  },

  editBudget(category, currentLimit) {
    UI.openBudgetModal();
    document.getElementById("budgetCatSelect").value = category;
    document.getElementById("budgetAmount").value = currentLimit;
  },

  deleteBudget(category) {
    UI.confirm(`Delete budget for ${category}?`, "Yes, Delete", () => {
      this.apiCall("/budgets", "DELETE", { category }, () => {
        delete Data.budgets[category];
        this.renderBudgetsPage();
        UI.showAlert("Deleted", `Budget for ${category} removed.`);
      });
    });
  },

  /* --- LOANS --- */
  /* --- LOANS (SYNCS INITIAL AMOUNT WITH BALANCE) --- */
  /* --- SAVE LOAN (STRICT ORDER FOR BALANCE SYNC) --- */
  saveLoan(e) {
    e.preventDefault();
    const nameInput = document.getElementById("loanName").value;
    const totalAmount = Number(document.getElementById("loanAmount").value);
    const loanType = document.getElementById("loanType").value;

    const combinedName = `${nameInput}::${totalAmount}`;
    const loanData = {
      name: combinedName,
      type: loanType,
      amount: totalAmount,
    };

    // STEP 1: Save the Loan
    this.apiCall("/loans", "POST", loanData, (savedLoan) => {
      Data.loans.push(savedLoan);

      // STEP 2: Prepare the Initial Transaction
      const txType = loanType === "Borrowed" ? "income" : "expense";
      const descText = loanType === "Borrowed" ? "Borrowed from" : "Lent to";

      const txData = {
        description: `${descText} ${nameInput}`,
        amount: totalAmount,
        type: txType,
        category: "Transfer", // Using generic category to avoid database block
        date: this.formatDate(new Date())
      };

      // STEP 3: Save the Transaction & Refresh Balance
      this.apiCall("/transactions", "POST", txData, (savedTx) => {
        Data.transactions.unshift(savedTx);
        this.refreshCurrentView(); // Recalculate dashboard balance immediately

        // Only close and show success AFTER everything is complete
        UI.closeModals();
        UI.showAlert("Success", "Loan added & balance updated!");
      });
    });
  },

  /* --- GOALS --- */
  saveGoal(e) {
    e.preventDefault();
    const goalData = {
      name: document.getElementById("goalName").value,
      target_amount: document.getElementById("goalTarget").value,
    };
    this.apiCall("/goals", "POST", goalData, (savedGoal) => {
      Data.goals.push(savedGoal);
      UI.closeModals();
      this.renderGoalsPage();
      UI.showAlert("Success", "Goal created!");
    });
  },

  /* --- CATEGORIES --- */
  addNewCategory(e) {
    e.preventDefault();
    const newCat = document.getElementById("newCatName").value;
    if (newCat && !Data.categories.includes(newCat)) {
      Data.categories.push(newCat);
      UI.closeModals();
      this.renderCategoriesPage();
      UI.showAlert("Success", "Category added!");
    } else {
      UI.showAlert("Error", "Category already exists.");
    }
  },

  /* --- UPDATE LOGIC (NOW SYNCS WITH TRANSACTIONS & BALANCE) --- */
  /* --- UPDATE LOGIC (SYNCS WITH TRANSACTIONS & BALANCE) --- */
  /* --- UPDATE LOGIC (STRICT ORDER FOR BALANCE SYNC) --- */
  submitUpdate(e) {
    e.preventDefault();
    const inputVal = Number(document.getElementById("updateInput").value);
    if (!inputVal || inputVal <= 0) return UI.showAlert("Error", "Enter valid amount");

    const { type, id, currentVal } = Data.pendingUpdate;

    let newData = {}, newTotal = 0;
    if (type === "loan") {
      newTotal = Math.max(0, currentVal - inputVal);
      newData = { amount: newTotal };
    } else {
      newTotal = currentVal + inputVal;
      newData = { saved_amount: newTotal };
    }

    // STEP 1: Update the Loan/Goal progress
    this.apiCall(`/${type}s/${id}`, "PUT", newData, () => {

      let txData = null;

      // STEP 2: Prepare the Transaction Data
      if (type === "loan") {
        const item = Data.loans.find((i) => i.id === id);
        if (item) {
          item.amount = newTotal; // Update UI internally
          const realName = item.name.split("::")[0];
          const txType = item.type === "Borrowed" ? "expense" : "income";

          txData = {
            description: `Loan Repayment: ${realName}`,
            amount: inputVal,
            type: txType,
            category: "Transfer", // Using generic category to avoid database block
            date: this.formatDate(new Date())
          };
        }
      } else {
        const item = Data.goals.find((i) => i.id === id);
        if (item) {
          item.saved_amount = newTotal; // Update UI internally
          txData = {
            description: `Goal Deposit: ${item.name}`,
            amount: inputVal,
            type: "expense",
            category: "Transfer", // Using generic category to avoid database block
            date: this.formatDate(new Date())
          };
        }
      }

      // STEP 3: Save the Transaction & Refresh Balance
      if (txData) {
        this.apiCall("/transactions", "POST", txData, (savedTx) => {
          Data.transactions.unshift(savedTx); // Add to local list
          this.refreshCurrentView(); // Recalculate dashboard balance immediately

          // Only close and show success AFTER everything is complete
          UI.closeModals();
          UI.showAlert("Success", "Payment recorded & balance updated!");
        });
      }
    });
  },

  deleteCategory(name) {
    UI.confirm(`Delete category "${name}"?`, "Yes, Delete", () => {
      Data.categories = Data.categories.filter((c) => c !== name);
      this.renderCategoriesPage();
      UI.showAlert("Deleted", "Category removed.");
    });
  },

  /* --- UPDATE LOGIC --- */
  startUpdate(type, id, currentVal) {
    Data.pendingUpdate = { type, id, currentVal: Number(currentVal) };
    if (type === "loan") UI.openUpdateModal("Repay Loan", "Amount Paid Back");
    else UI.openUpdateModal("Add Savings", "Amount to Deposit");
  },

  /* --- DELETE LOGIC --- */
  deleteItem(type, id) {
    UI.confirm("Are you sure you want to delete this?", "Yes, Delete", () => {
      this.apiCall(`/${type}/${id}`, "DELETE", {}, () => {
        Data[type] = Data[type].filter((item) => item.id !== id);
        this.refreshCurrentView();
        UI.showAlert("Deleted", "Item removed successfully.");
      });
    });
  },

  /* --- CHANGE PASSWORD --- */
  async changePassword() {
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) return UI.showAlert("Error", "All fields are required.");
    if (newPassword !== confirmPassword) return UI.showAlert("Error", "Passwords do not match.");
    if (newPassword.length < 6) return UI.showAlert("Error", "Password must be at least 6 characters.");

    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      
      const data = await res.json();
      if (res.ok) {
        UI.showAlert("Success", "Password updated successfully.");
        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("confirmPassword").value = "";
      } else {
        UI.showAlert("Error", data.replace(/"/g, ""));
      }
    } catch (err) {
      console.error(err);
      UI.showAlert("Error", "Server connection failed.");
    }
  },

  executeConfirm() {
    if (Data.confirmCallback) Data.confirmCallback();
    UI.closeModals();
  },

  async apiCall(endpoint, method, body, onSuccess) {
    try {
      const opts = {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${API_URL}${endpoint}`, opts);
      if (res.ok) {
        const data = res.status !== 204 ? await res.json() : null;
        onSuccess(data);
      } else {
        const errorText = await res.text();
        UI.showAlert("Error", errorText.replace(/"/g, "") || "Action failed.");
      }
    } catch (err) {
      console.error(err);
      UI.showAlert("Error", "Server connection failed.");
    }
  },

  refreshCurrentView() {
    const active = document.querySelector(".nav-item.active");
    if (active) {
      const txt = active.innerText;
      if (txt.includes("Transactions")) this.renderTransactionsPage();
      else if (txt.includes("Loans")) this.renderLoansPage();
      else if (txt.includes("Goals")) this.renderGoalsPage();
      else if (txt.includes("Budgets")) this.renderBudgetsPage();
      else if (txt.includes("Categories")) this.renderCategoriesPage();
      else if (txt.includes("Settings")) this.renderSettingsPage();
      else if (txt.includes("Profile")) this.renderProfilePage();
      else if (txt.includes("calendar")) this.renderCalendarPage();
      else this.renderDashboard();
    } else {
      this.renderDashboard();
    }
  },

  /* --- SMART ADVISOR ENGINE --- */
  getAdvisorAnalysis(balance, totalIncome, totalExpense) {
    let score = 0;
    let tips = [];
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

    if (balance > 0) score += 30;
    if (savingsRate >= 20) score += 30;
    else if (savingsRate > 0) score += 10;

    let overBudgetCount = 0;
    const catSpent = {};
    Data.transactions.filter(t => t.type === 'expense').forEach(e => catSpent[e.category] = (catSpent[e.category] || 0) + Number(e.amount));

    Object.entries(Data.budgets).forEach(([cat, limit]) => {
      if ((catSpent[cat] || 0) > limit) overBudgetCount++;
    });

    if (overBudgetCount === 0) score += 20;
    if (Data.goals.some(g => Number(g.saved_amount) > 0)) score += 20;

    if (totalExpense > totalIncome) {
      tips.push({ icon: "fa-exclamation-triangle", color: "var(--danger)", text: "<b>Critical:</b> You are spending more than you earn!" });
    } else if (savingsRate < 10) {
      tips.push({ icon: "fa-wallet", color: "#f59e0b", text: "<b>Tip:</b> Try to save at least 20% of your income." });
    }

    if (overBudgetCount > 0) {
      tips.push({ icon: "fa-chart-pie", color: "var(--danger)", text: `<b>Alert:</b> You have exceeded ${overBudgetCount} budget limits.` });
    }

    const monthlySavings = totalIncome - totalExpense;
    const activeGoal = Data.goals.find(g => Number(g.saved_amount) < Number(g.target_amount));
    if (activeGoal && monthlySavings > 0) {
      const remaining = Number(activeGoal.target_amount) - Number(activeGoal.saved_amount);
      const months = Math.ceil(remaining / monthlySavings);
      tips.push({ icon: "fa-hourglass-half", color: "var(--primary)", text: `<b>Forecast:</b> At this rate, you'll reach your <u>${activeGoal.name}</u> goal in ${months} months!` });
    }

    if (tips.length === 0) tips.push({ icon: "fa-check-circle", color: "var(--success)", text: "Great job! Your finances are looking healthy." });

    return { score, tips };
  },

  /* --- RENDERERS --- */
  renderDashboard() {
    const totalIncome = Data.transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = Data.transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const balance = totalIncome - totalExpense;
    const icon = Data.privacyMode ? "fa-eye-slash" : "fa-eye";

    const advisor = this.getAdvisorAnalysis(balance, totalIncome, totalExpense);
    const scoreColor = advisor.score > 75 ? "var(--success)" : advisor.score > 40 ? "#f59e0b" : "var(--danger)";

    document.getElementById("mainContent").innerHTML = `
        <div class="header-row">
            <div><h1 class="page-title">Dashboard</h1><p style="color:var(--text-muted)">Welcome, <span style="color:var(--primary)">${currentUserName}</span></p></div>
            <button onclick="UI.openExpenseModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Transaction</button>
        </div>

        <div class="card" style="margin-bottom:25px; border-left: 5px solid ${scoreColor};">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <div style="position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:4px solid ${scoreColor}; font-weight:bold; font-size:1.2rem; color:var(--text-main);">
                        ${advisor.score}
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">Financial Health Score</div>
                        <div style="font-size:0.85rem; color:var(--text-muted);">Based on your savings & budgets</div>
                    </div>
                </div>

                <div style="flex:1; min-width:250px; background:var(--bg-body); padding:12px; border-radius:8px;">
                    ${advisor.tips.map(tip => `
                        <div style="display:flex; gap:10px; align-items:start; margin-bottom:5px; font-size:0.9rem; color:var(--text-main);">
                            <i class="fas ${tip.icon}" style="color:${tip.color}; margin-top:3px;"></i>
                            <span>${tip.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="stats-grid dashboard-stats">
            <div class="card" style="background: var(--primary-gradient); color: white; border:none;">
                <div style="font-weight:600;font-size:0.85rem;text-transform:uppercase;opacity:0.9">Current Balance</div>
                <div class="balance-val" style="color:white; -webkit-text-fill-color:white;">${this.formatMoney(balance)}</div>
                <i class="fas ${icon}" style="position:absolute;top:24px;right:24px;cursor:pointer;opacity:0.8" onclick="App.togglePrivacy()"></i>
            </div>
            <div class="card"><div style="color:var(--text-muted);font-weight:600;font-size:0.85rem;text-transform:uppercase">Income</div><div class="balance-val text-income">${this.formatMoney(totalIncome)}</div></div>
            <div class="card"><div style="color:var(--text-muted);font-weight:600;font-size:0.85rem;text-transform:uppercase">Expense</div><div class="balance-val text-expense">${this.formatMoney(totalExpense)}</div></div>
        </div>
        <div class="quick-grid">
          <div class="quick-card" onclick="App.navigate('budgets')">
              <i class="fas fa-piggy-bank quick-icon"></i><br><strong>Budgets</strong>
          </div>
          <div class="quick-card" onclick="App.renderCalendarPage()">
              <i class="fas fa-calendar-alt quick-icon"></i><br><strong>Calendar</strong>
          </div>
          <div class="quick-card" onclick="App.navigate('loans')">
              <i class="fas fa-hand-holding-usd quick-icon"></i><br><strong>Loans</strong>
          </div>
          <div class="quick-card" onclick="App.navigate('goals')">
              <i class="fas fa-trophy quick-icon"></i><br><strong>Goals</strong>
          </div>
        </div>
        <div class="card"><h3 style="margin-bottom:20px;color:var(--text-main)">Analytics</h3><div style="height:300px"><canvas id="mainChart"></canvas></div></div>
    `;
    setTimeout(() => this.renderChart(), 100);
  },

  changeMonth(offset) {
    Data.currentViewDate.setMonth(Data.currentViewDate.getMonth() + offset);
    this.renderCalendarPage();
  },

  renderCalendarPage() {
    const date = Data.currentViewDate;
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const dailySpend = {};
    Data.transactions.forEach(t => {
      const tDate = new Date(t.date);
      const localDate = new Date(tDate.getTime() - (tDate.getTimezoneOffset() * 60000));

      if (t.type === 'expense' && localDate.getUTCMonth() === currentMonth && localDate.getUTCFullYear() === currentYear) {
        const day = localDate.getUTCDate();
        dailySpend[day] = (dailySpend[day] || 0) + Number(t.amount);
      }
    });

    let calendarHTML = `
        <div class="calendar-wrapper" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-top: 10px;">
            ${dayNames.map(day => `<div style="text-align:center; font-weight:bold; font-size:0.8rem; color:var(--text-muted); padding:10px 0;">${day}</div>`).join('')}
    `;

    for (let x = 0; x < firstDayIndex; x++) {
      calendarHTML += `<div style="background:transparent; min-height:80px;"></div>`;
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const spent = dailySpend[i] || 0;
      let bg = "var(--bg-surface)";
      let textColor = "var(--text-main)";
      let border = "var(--border)";

      if (spent > 0) {
        if (spent > 2000) { bg = "#fef2f2"; textColor = "#ef4444"; border = "#fecaca"; }
        else if (spent > 500) { bg = "#fffbeb"; textColor = "#f59e0b"; border = "#fde68a"; }
        else { bg = "#f0fdf4"; textColor = "#10b981"; border = "#bbf7d0"; }
      }

      const today = new Date();
      const isToday = (i === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear());
      const todayStyle = isToday ? `border: 2px solid var(--primary); transform: scale(1.02); z-index:1;` : `border: 1px solid ${border};`;

      // FIXED: Added cursor:pointer and onclick="App.viewDayTransactions(...)"
      // Notice the class="cal-amount" added to the spent > 0 div!
      calendarHTML += `
            <div class="cal-day" onclick="App.viewDayTransactions(${currentYear}, ${currentMonth}, ${i})" style="background:${bg}; ${todayStyle} min-height:90px; padding:8px; border-radius:8px; display:flex; flex-direction:column; justify-content:space-between; transition: 0.2s; cursor:pointer;">
                <span style="font-size:0.9rem; opacity:${isToday ? '1' : '0.6'}; font-weight:${isToday ? 'bold' : '500'}">${i}</span>
                ${spent > 0 ? `<div class="cal-amount" style="color:${textColor}; font-size:0.75rem; font-weight:700; text-align:right; word-break:break-all;">${this.formatMoney(spent, true)}</div>` : ''}
            </div>
        `;
    }
    
    calendarHTML += '</div>';

    document.getElementById("mainContent").innerHTML = `
        <div class="header-row" style="display:flex; justify-content:space-between; align-items:center;">
            <button onclick="App.changeMonth(-1)" class="btn" style="background:var(--bg-surface); border:1px solid var(--border); width:40px; height:40px; border-radius:50%; cursor:pointer;"><i class="fas fa-chevron-left"></i></button>
            <div style="text-align:center;">
                <h1 class="page-title" style="margin:0; font-size:1.5rem;">${monthNames[currentMonth]}</h1>
                <div style="color:var(--text-muted); font-size:0.9rem; font-weight:600;">${currentYear}</div>
            </div>
            <button onclick="App.changeMonth(1)" class="btn" style="background:var(--bg-surface); border:1px solid var(--border); width:40px; height:40px; border-radius:50%; cursor:pointer;"><i class="fas fa-chevron-right"></i></button>
        </div>
        
        <div class="card" style="margin: 15px 0; padding: 10px; display: flex; justify-content: center; gap: 20px; font-size: 0.75rem; font-weight: 600;">
             <span><span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;margin-right:5px;"></span>Low</span>
             <span><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-right:5px;"></span>Medium</span>
             <span><span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;margin-right:5px;"></span>High (>2k)</span>
        </div>

        <div class="card" style="padding: 10px;">
            ${calendarHTML}
        </div>
    `;
  },

  viewDayTransactions(year, month, day) {
    const targetDate = new Date(year, month, day);
    const targetDateString = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().split("T")[0];

    const dayTxs = Data.transactions.filter(t => this.formatDate(t.date) === targetDateString);

    const modalTitle = document.getElementById("dayModalTitle");
    const modalContent = document.getElementById("dayModalContent");

    modalTitle.innerText = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    if (dayTxs.length === 0) {
      modalContent.innerHTML = `<div style="text-align:center; padding: 30px 10px; color:var(--text-muted);"><i class="fas fa-receipt" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><br>No transactions on this day.</div>`;
    } else {
      let listHTML = `<table style="width:100%; border-collapse: collapse;"><tbody>`;

      dayTxs.forEach(t => {
        const isIncome = t.type === 'income';
        const color = isIncome ? 'var(--success)' : 'var(--danger)';
        const sign = isIncome ? '+' : '-';

        listHTML += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 12px 0;">
                        <strong style="color:var(--text-main); display:block; font-size:0.95rem;">${t.description}</strong>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${t.category}</span>
                    </td>
                    <td style="padding: 12px 0; text-align:right; font-weight:700; color:${color}; font-size:0.95rem;">
                        ${sign} ${this.formatMoney(t.amount, true)}
                    </td>
                </tr>
            `;
      });

      listHTML += `</tbody></table>`;
      modalContent.innerHTML = listHTML;
    }

    document.getElementById("dayModal").classList.remove("hidden");
  },

  renderTransactionsPage() {
    const incomeTx = Data.transactions.filter((t) => t.type === "income");
    const expenseTx = Data.transactions.filter((t) => t.type === "expense");

    // Replaced .split("T")[0] with formatDate helper
    const createRow = (t) => `
      <tr>
        <td><strong>${t.description}</strong><br><span style="font-size:0.8rem;color:grey">${t.category}</span></td>
        <td>${this.formatDate(t.date)}</td> 
        <td style="font-weight:600; color:${t.type === "income" ? "var(--success)" : "var(--danger)"}">
          ${t.type === "income" ? "+" : "-"} ${this.formatMoney(t.amount, true)}
        </td>
        <td><button onclick="App.deleteItem('transactions', ${t.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;"><i class="fas fa-trash"></i></button></td>
      </tr>`;

    const createSection = (title, icon, color, data) => `
      <h3 style="color:${color}; margin-bottom:15px; display:flex; align-items:center; gap:10px;"><i class="fas ${icon}"></i> ${title}</h3>
      <div class="card" style="padding:0; overflow:hidden; margin-bottom:30px;">
        <table>
          <thead><tr><th>Description</th><th>Date</th><th>Amount</th><th>Action</th></tr></thead>
          <tbody>${data && data.length ? data.map((t) => createRow(t)).join("") : `<tr><td colspan="4" style="text-align:center;padding:20px;color:grey;">No records.</td></tr>`}</tbody>
        </table>
      </div>`;

    document.getElementById("mainContent").innerHTML = `  
      <div class="header-row" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;">
        <h1 class="page-title" style="margin:0;">Transactions</h1>
        <div style="display:flex;align-items:center;gap:12px;">
          <button onclick="UI.openExpenseModal()" class="btn btn-primary" style="display:flex;align-items:center;gap:6px;padding:12px 24px;font-weight:500;"><i class="fas fa-plus"></i>Add Transaction</button>
          <input type="text" placeholder="Search..." onkeyup="UI.filterTable(this)" class="input-field" style="width:250px;padding:12px 24px;">
        </div>
      </div>
      ${createSection("Income", "fa-arrow-up", "var(--success)", incomeTx)}
      ${createSection("Expenses", "fa-arrow-down", "var(--danger)", expenseTx)}
    `;
  },

  renderBudgetsPage() {
    const catSpent = {};
    Data.transactions.filter((t) => t.type === "expense").forEach((e) => (catSpent[e.category] = (catSpent[e.category] || 0) + Number(e.amount)));
    const budgetEntries = Object.entries(Data.budgets);

    document.getElementById("mainContent").innerHTML = `
        <div class="header-row"><h1 class="page-title">Budgets</h1><button onclick="UI.openBudgetModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Set Budget</button></div>
        <div class="stats-grid">
            ${budgetEntries.length === 0 ? `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No budgets set yet.</div>` : budgetEntries.map(([cat, limit]) => {
      const spent = catSpent[cat] || 0;
      const remaining = limit - spent;
      const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
      return `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                            <div><strong style="font-size:1.1rem;">${cat}</strong><div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Monthly Budget</div></div>
                            <div style="display:flex; gap:10px;">
                                <button onclick="App.editBudget('${cat}', ${limit})" style="background:var(--bg-body); border:1px solid var(--border); width:35px; height:35px; border-radius:8px; color:var(--primary); cursor:pointer;"><i class="fas fa-edit"></i></button>
                                <button onclick="App.deleteBudget('${cat}')" style="background:#fef2f2; border:1px solid #fee2e2; width:35px; height:35px; border-radius:8px; color:var(--danger); cursor:pointer;"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px;">
                            <h2 style="margin:0; color:${remaining >= 0 ? "var(--primary)" : "var(--danger)"}">${this.formatMoney(spent, true)}</h2>
                            <span style="font-size:0.85rem; color:var(--text-muted);">of ${this.formatMoney(limit, true)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:5px;"><span>Spent</span><span>${Math.round(pct)}%</span></div>
                        <div class="progress-container" style="height:10px; background:var(--bg-body); border-radius:10px; overflow:hidden;">
                            <div class="progress-bar" style="width:${pct}%; background:${pct > 90 ? "var(--danger)" : "var(--primary-gradient)"}; height:100%; transition: width 0.5s ease;"></div>
                        </div>
                    </div>`;
    }).join("")}
        </div>`;
  },

  renderLoansPage() {
    document.getElementById("mainContent").innerHTML = `
            <div class="header-row"><h1 class="page-title">Loans</h1><button onclick="UI.openLoanModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Loan</button></div>
            <div class="stats-grid">
                ${Data.loans.length === 0 ? '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No active loans.</div>' : Data.loans.map((l) => {
      let [realName, originalTotal] = l.name.split("::");
      if (!originalTotal) { realName = l.name; originalTotal = l.amount; }
      const current = Number(l.amount);
      const total = Number(originalTotal);
      const paid = total - current;
      const pct = total > 0 ? (paid / total) * 100 : 0;
      return `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                            <div><strong style="font-size:1.1rem;">${realName}</strong><div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${l.type === "Lent" ? "Money you lent" : "Money you borrowed"}</div></div>
                            <div style="display:flex; gap:10px;">
                                <button onclick="App.startUpdate('loan', ${l.id}, ${current})" style="background:var(--bg-body); border:1px solid var(--border); width:35px; height:35px; border-radius:8px; color:var(--primary); cursor:pointer;"><i class="fas fa-edit"></i></button>
                                <button onclick="App.deleteItem('loans', ${l.id})" style="background:#fef2f2; border:1px solid #fee2e2; width:35px; height:35px; border-radius:8px; color:var(--danger); cursor:pointer;"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px;">
                            <h2 style="margin:0; color:${l.type === "Lent" ? "var(--success)" : "var(--danger)"}">${this.formatMoney(current, true)}</h2>
                            <span style="font-size:0.85rem; color:var(--text-muted);">of ${this.formatMoney(total, true)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:5px;"><span>${l.type === "Lent" ? "Received" : "Paid Back"}</span><span>${Math.round(pct)}%</span></div>
                        <div class="progress-container" style="height:10px; background:var(--bg-body); border-radius:10px; overflow:hidden;">
                            <div class="progress-bar" style="width: ${pct}%; background: var(--success); height:100%; transition: width 0.5s ease;"></div>
                        </div>
                    </div>`;
    }).join("")}
            </div>`;
  },

  renderGoalsPage() {
    document.getElementById("mainContent").innerHTML = `
            <div class="header-row"><h1 class="page-title">Goals</h1><button onclick="UI.openGoalModal()" class="btn btn-primary"><i class="fas fa-plus"></i> New Goal</button></div>
            <div class="stats-grid">
                ${Data.goals.length === 0 ? '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No goals set.</div>' : Data.goals.map((g) => {
      const saved = Number(g.saved_amount);
      const target = Number(g.target_amount);
      let pct = target > 0 ? (saved / target) * 100 : 0;
      if (pct > 100) pct = 100;
      return `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                            <strong>${g.name}</strong>
                            <div style="display:flex; gap:10px;">
                                <button onclick="App.startUpdate('goal', ${g.id}, ${saved})" style="background:var(--bg-body); border:1px solid var(--border); width:35px; height:35px; border-radius:8px; color:var(--success); cursor:pointer;"><i class="fas fa-plus"></i></button>
                                <button onclick="App.deleteItem('goals', ${g.id})" style="background:#fef2f2; border:1px solid #fee2e2; width:35px; height:35px; border-radius:8px; color:var(--danger); cursor:pointer;"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <h2 style="margin:5px 0">${this.formatMoney(saved, true)} <span style="font-size:0.9rem; color:var(--text-muted); font-weight:500;">/ ${this.formatMoney(target, true)}</span></h2>
                        <div class="progress-container" style="height:10px; background:var(--bg-body); border-radius:10px; overflow:hidden; margin-top:15px;">
                            <div class="progress-bar" style="width: ${pct}%; background: ${pct >= 100 ? "var(--success)" : "var(--primary-gradient)"}; height:100%;"></div>
                        </div>
                    </div>`;
    }).join("")}
            </div>`;
  },

  renderCategoriesPage() {
    document.getElementById("mainContent").innerHTML = `
            <div class="header-row"><h1 class="page-title">Categories</h1><button onclick="UI.openCategoryModal()" class="btn btn-primary"><i class="fas fa-plus"></i> Add New</button></div>
            <div class="category-grid">
                ${Data.categories.map((c) => `
                <div class="category-pill">
                    <div style="display:flex; align-items:center;">
                        <div class="cat-icon-box"><i class="fas fa-tag"></i></div>
                        <span style="font-weight:600; color:var(--text-main);">${c}</span>
                    </div>
                    <button onclick="App.deleteCategory('${c}')" class="delete-mini-btn"><i class="fas fa-times"></i></button>
                </div>`).join("")}
            </div>`;
  },

  renderReportsPage() {
    const cats = {};
    Data.transactions.filter((t) => t.type === "expense").forEach((e) => (cats[e.category] = (cats[e.category] || 0) + Number(e.amount)));
    document.getElementById("mainContent").innerHTML = `
            <h1 class="page-title">Analytics</h1>
            <div class="card" style="height:400px; position:relative; margin-top:30px ;margin-bottom:30px;"><canvas id="analyticsChart"></canvas></div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:20px;">
                 ${Object.entries(cats).map(([cat, amount]) => `<div class="card" style="padding:20px; text-align:center;"><strong style="display:block; margin-bottom:10px; color:var(--text-muted);">${cat}</strong><div style="font-size:1.4rem; font-weight:700; color:var(--text-main);">${this.formatMoney(amount, true)}</div></div>`).join("")}
            </div>`;
    setTimeout(() => {
      const ctx = document.getElementById("analyticsChart");
      if (ctx) new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: Object.keys(cats),
          datasets: [{ data: Object.values(cats), backgroundColor: ["#06b6d4", "#2563eb", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"], borderWidth: 0 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
      });
    }, 100);
  },

  renderProfilePage() {
    document.getElementById("mainContent").innerHTML = `
        <h1 class="page-title">Profile</h1>
        
        <div style="max-width: 600px; margin: 0 auto;">
            
            <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 25px; text-align: center;">
                <div style="height: 100px; background: var(--primary-gradient);"></div>
                <div style="margin-top: -50px;">
                    <div style="background: var(--bg-surface); width: 100px; height: 100px; border-radius: 50%; padding: 5px; margin: 0 auto;">
                        <div style="background: var(--primary-light); width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: var(--primary);">
                            <i class="fas fa-user"></i>
                        </div>
                    </div>
                </div>
                <div style="padding: 20px;">
                    <h2 style="margin: 0; font-size: 1.5rem; color: var(--text-main);">${currentUserName}</h2>
                    <p style="margin: 5px 0 0; color: var(--text-muted); font-size: 0.9rem;">${currentUserEmail}</p>
                </div>
            </div>

            <div class="card" style="margin-bottom: 25px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                    <div style="width: 40px; height: 40px; background: var(--bg-body); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                        <i class="fas fa-lock"></i>
                    </div>
                    <div>
                        <strong style="display: block; color: var(--text-main);">Security</strong>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Change your password</span>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="position: relative;">
                        <i class="fas fa-key" style="position: absolute; left: 15px; top: 14px; color: var(--text-muted);"></i>
                        <input type="password" id="currentPassword" placeholder="Current Password" class="input-field" style="padding-left: 40px;">
                    </div>
                    <div style="position: relative;">
                        <i class="fas fa-unlock-alt" style="position: absolute; left: 15px; top: 14px; color: var(--text-muted);"></i>
                        <input type="password" id="newPassword" placeholder="New Password" class="input-field" style="padding-left: 40px;">
                    </div>
                    <div style="position: relative;">
                        <i class="fas fa-check-circle" style="position: absolute; left: 15px; top: 14px; color: var(--text-muted);"></i>
                        <input type="password" id="confirmPassword" placeholder="Confirm New Password" class="input-field" style="padding-left: 40px;">
                    </div>
                    <button onclick="App.changePassword()" class="btn btn-primary full-width" style="margin-top: 10px;">
                        Update Password
                    </button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 40px;">
                <button onclick="Auth.logout()" class="btn" style="background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main); padding: 15px;">
                    <i class="fas fa-sign-out-alt" style="margin-right: 8px;"></i> Logout
                </button>
                <button onclick="Auth.deleteAccount()" class="btn" style="background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; padding: 15px;">
                    <i class="fas fa-trash-alt" style="margin-right: 8px;"></i> Delete
                </button>
            </div>
        </div>
    `;
  },

  renderSettingsPage() {
    const isChecked = Data.theme === "dark" ? "checked" : "";
    const currentCurr = localStorage.getItem("cashen_currency") || "₹";

    document.getElementById("mainContent").innerHTML = `
            <h1 class="page-title">Settings</h1>
            <div style="max-width:1100px;">
                <h3 style="margin:20px 0 15px; color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">App Preferences</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
                    <div class="currency-setting" style="padding:20px; border:1px solid var(--border); border-radius:14px; background:var(--bg-surface); box-shadow:var(--shadow);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <strong>Display Currency</strong>
                          <select onchange="App.changeCurrency(this)" style="width:120px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-body); color:var(--text-main);">
                            <option value="₹" ${currentCurr === "₹" ? "selected" : ""}>₹ Rupee</option>
                            <option value="$" ${currentCurr === "$" ? "selected" : ""}>$ Dollar</option>
                            <option value="€" ${currentCurr === "€" ? "selected" : ""}>€ Euro</option>
                            <option value="£" ${currentCurr === "£" ? "selected" : ""}>£ Pound</option>
                          </select>
                        </div>
                        <div style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">
                          Auto-converts from your base currency (${BASE_CURRENCY_CODE})
                        </div>
                    </div>
                    <div class="darkmode-setting" style="padding:20px; border:1px solid var(--border); border-radius:14px; background:var(--bg-surface); box-shadow:var(--shadow);">
                        <div style="display:flex; justify-content:space-between; align-items:center;"><strong>Dark Mode</strong><label class="switch"><input type="checkbox" onchange="App.toggleTheme()" ${isChecked}><span class="slider"></span></label></div>
                        <div style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">Switch between light and dark themes</div>
                    </div>
                </div>
                <h3 style="margin:40px 0 15px; color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">Data Management</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
                    <div class="export-setting" style="padding:20px; border:1px solid var(--border); border-radius:14px; background:var(--bg-surface); box-shadow:var(--shadow);">
                        <div style="display:flex; justify-content:space-between; align-items:center;"><strong>Export Data</strong><button onclick="App.exportData()" style="padding:8px 20px; border-radius:8px; border:1px solid var(--border); background:var(--bg-body); color:var(--primary); cursor:pointer;">Download</button></div>
                        <div style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">Download transactions as CSV</div>
                    </div>
                    <div class="reset-setting" style="padding:20px; border:1px solid var(--border); border-radius:14px; background:var(--bg-surface); box-shadow:var(--shadow);">
                        <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="color:var(--danger);">Reset Data</strong><button onclick="App.resetData()" style="padding:8px 20px; border-radius:8px; border:1px solid #fecaca; background:#fee2e2; color:var(--danger); cursor:pointer;">Reset</button></div>
                        <div style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">Clear all transactions (Cannot undo)</div>
                    </div>
                </div>
            </div>`;
  },

  navigate(page, el) {
    document.querySelectorAll(".nav-item").forEach((e) => e.classList.remove("active"));
    if (el) el.classList.add("active");
    if (window.innerWidth <= 768) UI.toggleSidebar();

    if (page === "dashboard") this.renderDashboard();
    else if (page === "transactions") this.renderTransactionsPage();
    else if (page === "budgets") this.renderBudgetsPage();
    else if (page === "loans") this.renderLoansPage();
    else if (page === "goals") this.renderGoalsPage();
    else if (page === "categories") this.renderCategoriesPage();
    else if (page === "reports") this.renderReportsPage();
    else if (page === "profile") this.renderProfilePage();
    else if (page === "settings") this.renderSettingsPage();
    else if (page === "calendar") this.renderCalendarPage();
  },

  togglePrivacy() {
    Data.privacyMode = !Data.privacyMode;
    this.renderDashboard();
  },

  toggleTheme() {
    Data.theme = Data.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", Data.theme);
    localStorage.setItem("cashen_theme", Data.theme);
  },

  /* --- CHANGE CURRENCY --- */
  async changeCurrency(el) {
    const symbol = el.value;
    localStorage.setItem("cashen_currency", symbol);

    // UI Feedback
    UI.showAlert("Saved", "Updating rates...");

    // Refresh view
    this.refreshCurrentView();
  },

  exportData() {
    if (Data.transactions.length === 0) return UI.showAlert("Info", "No data to export.");
    let csvContent = "data:text/csv;charset=utf-8,Date,Description,Category,Type,Amount\n";
    Data.transactions.forEach((t) => {
      const row = `${this.formatDate(t.date)},${t.description},${t.category},${t.type},${t.amount}`;
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "cashen_transactions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  resetData() {
    UI.confirm("Delete ALL transactions? This cannot be undone.", "Yes, Clear All", () => {
      Data.transactions = [];
      this.refreshCurrentView();
      UI.showAlert("Reset", "All transactions cleared locally.");
    });
  },

  formatMoney(amount, forceShow = false) {
    if (!forceShow && Data.privacyMode) return "*****";

    const targetSymbol = localStorage.getItem("cashen_currency") || "₹";
    const targetCode = CURRENCY_MAP[targetSymbol] || BASE_CURRENCY_CODE;
    const rate = Data.rates[targetCode] || 1;

    const convertedAmount = amount * rate;

    return targetSymbol + " " + Math.abs(convertedAmount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  renderChart() {
    const ctx = document.getElementById("mainChart");
    if (!ctx) return;
    const cats = {};
    Data.transactions.filter((t) => t.type === "expense").forEach((e) => (cats[e.category] = (cats[e.category] || 0) + Number(e.amount)));
    if (window.myChartInstance) window.myChartInstance.destroy();
    window.myChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(cats),
        datasets: [{
          label: "Expense",
          data: Object.values(cats),
          backgroundColor: ["#06b6d4", "#2563eb", "#8b5cf6", "#10b981"],
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } } },
      },
    });
  },
};

/* --- AUTH OBJECT --- */
const Auth = {
  logout() {
    UI.confirm("Are you sure you want to logout?", "Yes, Logout", () => {
      localStorage.clear();
      window.location.href = "login.html";
    });
  },
  deleteAccount() {
    UI.confirm("Permanently delete account?", "Yes, Delete", () => {
      App.apiCall("/auth/delete-account", "DELETE", {}, () => {
        localStorage.clear();
        window.location.href = "register.html";
      });
    });
  },
};

/* --- UI HELPERS --- */
const UI = {
  openExpenseModal() {
    document.getElementById("expenseModal").classList.remove("hidden");
    this.popCats("categorySelect");
  },
  openBudgetModal() {
    document.getElementById("budgetModal").classList.remove("hidden");
    this.popCats("budgetCatSelect");
  },
  openLoanModal() { document.getElementById("loanModal").classList.remove("hidden"); },
  openGoalModal() { document.getElementById("goalModal").classList.remove("hidden"); },
  openCategoryModal() { document.getElementById("categoryModal").classList.remove("hidden"); },

  openUpdateModal(title, label) {
    document.getElementById("updateTitle").innerText = title;
    document.getElementById("updateLabel").innerText = label;
    document.getElementById("updateInput").value = "";
    document.getElementById("updateModal").classList.remove("hidden");
    document.getElementById("updateInput").focus();
  },

  confirm(msg, btnText, callback) {
    document.getElementById("confirmMsg").innerText = msg;
    const btn = document.getElementById("confirmBtn");
    if (btn) btn.innerText = btnText;
    Data.confirmCallback = callback;
    document.getElementById("confirmModal").classList.remove("hidden");
  },

  showAlert(title, msg) {
    document.getElementById("alertTitle").innerText = title;
    document.getElementById("alertMsg").innerText = msg;
    const iconBox = document.getElementById("alertIconBox");
    const icon = document.getElementById("alertIcon");

    iconBox.classList.remove("success", "danger");
    icon.className = "";

    if (title.toLowerCase().includes("error") || title.toLowerCase().includes("failed") || title.toLowerCase().includes("deleted")) {
      iconBox.classList.add("danger");
      icon.classList.add("fas", "fa-times");
    } else {
      iconBox.classList.add("success");
      icon.classList.add("fas", "fa-check");
    }
    document.getElementById("alertModal").classList.remove("hidden");
  },

  closeModals() {
    document.querySelectorAll(".modal-overlay").forEach((e) => e.classList.add("hidden"));
    document.querySelectorAll("form").forEach((f) => f.reset());
  },
  popCats(id) {
    const s = document.getElementById(id);
    if (s) {
      s.innerHTML = "";
      Data.categories.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.innerText = c;
        s.appendChild(o);
      });
    }
  },
  filterTable(inp) {
    const v = inp.value.toLowerCase();
    document.querySelectorAll("table tbody tr").forEach((tr) => {
      if (tr.innerText.includes("No records")) return;
      tr.style.display = tr.innerText.toLowerCase().includes(v) ? "" : "none";
    });
  },
  toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
    document.getElementById("sidebarOverlay").classList.toggle("active");
  },
  setType(type) {
    document.getElementById("transType").value = type;
    document.querySelectorAll(".type-option").forEach((el) => el.classList.remove("active"));
    document.getElementById("btn-" + type).classList.add("active");
  },
};

if (token) App.init();