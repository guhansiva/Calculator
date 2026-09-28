'use strict';

/* =========================================================
   Premium Calculator — script.js
   Modular vanilla JavaScript (ES6)
   ========================================================= */

/* ---------- DOM References ---------- */
const previousOperandEl = document.getElementById('previous-operand');
const currentOperandEl = document.getElementById('current-operand');
const errorMessageEl = document.getElementById('error-message');
const buttonsContainer = document.querySelector('.buttons');
const allButtons = document.querySelectorAll('.btn');
const themeToggleBtn = document.getElementById('theme-toggle'); // NEW — Upgrade 1

/* ---------- Calculator State ---------- */
// Centralizing state in one object avoids scattered global variables.
const calculatorState = {
  currentOperand: '0',   // What the user is currently typing
  previousOperand: '',   // The stored operand + operator, shown above current
  operator: null,        // Current pending operator: '+', '-', '×', '÷'
  overwrite: true,       // If true, next digit press replaces currentOperand
  errorActive: false,    // True while an error state is being displayed
};

/* Maximum digits allowed on display before we stop accepting input,
   this prevents overflow / unreadable expressions. */
const MAX_DIGITS = 15;

/* =========================================================
   Utility Functions
   ========================================================= */

/**
 * Formats a numeric string with thousand separators for readability,
 * while preserving any trailing decimal point / digits being typed.
 * @param {string} value
 * @returns {string}
 */
function formatNumber(value) {
  if (value === '' || value === '-') return value;

  const [integerPart, decimalPart] = value.split('.');
  const isNegative = integerPart.startsWith('-');
  const digitsOnly = isNegative ? integerPart.slice(1) : integerPart;

  let formattedInteger = '';
  if (digitsOnly === '') {
    formattedInteger = '';
  } else {
    formattedInteger = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Number(digitsOnly));
  }

  let result = (isNegative ? '-' : '') + formattedInteger;
  if (decimalPart !== undefined) {
    result += '.' + decimalPart;
  }
  return result;
}

/**
 * Displays an error message to the user, marks the error state,
 * and briefly shakes the display for visual feedback.
 * @param {string} message
 */
function showError(message) {
  calculatorState.errorActive = true;
  calculatorState.currentOperand = 'Error';
  calculatorState.previousOperand = '';
  calculatorState.operator = null;
  calculatorState.overwrite = true;

  errorMessageEl.textContent = message;
  currentOperandEl.parentElement.classList.add('shake');
  setTimeout(() => currentOperandEl.parentElement.classList.remove('shake'), 350);

  updateDisplay();
}

/**
 * Clears any active error message text.
 */
function clearError() {
  calculatorState.errorActive = false;
  errorMessageEl.textContent = '';
}

/* =========================================================
   UPGRADE 1 — THEME SWITCHER
   Cycles Dark Purple → Light → AMOLED Black → Blue Neon.
   Persists the choice in localStorage and restores it on load.
   Fully independent of the calculator logic below.
   ========================================================= */

// Ordered list of themes and the icon shown for each.
const THEME_ORDER = ['dark', 'light', 'amoled', 'blue'];
const THEME_ICONS = {
  dark: '🌙',
  light: '☀️',
  amoled: '⚫',
  blue: '💙',
};
const THEME_STORAGE_KEY = 'calculator-theme';

/**
 * Applies a theme by setting the data-theme attribute (CSS reads this
 * to swap variable values) and updating the toggle button's icon/label.
 * @param {string} theme - One of THEME_ORDER
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = THEME_ICONS[theme] || THEME_ICONS.dark;
    themeToggleBtn.setAttribute('aria-label', `Current theme: ${theme}. Tap to switch theme.`);
  }
}

/**
 * Reads the saved theme from localStorage (defaults to 'dark')
 * and applies it. Called once on page load.
 */
function initTheme() {
  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  } catch (err) {
    // localStorage may be unavailable (e.g. private browsing) — fall back silently.
    savedTheme = 'dark';
  }
  if (!THEME_ORDER.includes(savedTheme)) savedTheme = 'dark';
  applyTheme(savedTheme);
}

/**
 * Advances to the next theme in THEME_ORDER, applies it,
 * and saves the choice to localStorage for next visit.
 */
function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextIndex = (THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length;
  const nextTheme = THEME_ORDER[nextIndex];

  applyTheme(nextTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (err) {
    // Ignore write failures — theme still applies for the current session.
  }
}

/* =========================================================
   Core Calculator Functions
   ========================================================= */

/**
 * Appends a digit (0-9) to the current operand.
 * Handles the "overwrite" flag so a fresh number replaces
 * the previous result/display instead of appending to it.
 * @param {string} digit
 */
function appendNumber(digit) {
  if (calculatorState.errorActive) clearDisplay();

  // Prevent runaway input length.
  if (calculatorState.currentOperand.replace('-', '').length >= MAX_DIGITS) {
    return;
  }

  if (calculatorState.overwrite) {
    calculatorState.currentOperand = digit;
    calculatorState.overwrite = false;
  } else {
    // Avoid multiple leading zeros like "00".
    if (calculatorState.currentOperand === '0') {
      calculatorState.currentOperand = digit;
    } else {
      calculatorState.currentOperand += digit;
    }
  }

  updateDisplay();
}

/**
 * Appends a decimal point to the current operand.
 * Prevents multiple decimal points from being added.
 */
function appendDecimal() {
  if (calculatorState.errorActive) clearDisplay();

  if (calculatorState.overwrite) {
    calculatorState.currentOperand = '0.';
    calculatorState.overwrite = false;
    updateDisplay();
    return;
  }

  // Guard against multiple decimal points (error handling requirement).
  if (calculatorState.currentOperand.includes('.')) {
    return;
  }

  calculatorState.currentOperand += '.';
  updateDisplay();
}

/**
 * Sets the pending operator for the next calculation.
 * If an operator is already pending, calculates the intermediate
 * result first (chained operations), then stores the new operator.
 * Also guards against selecting multiple operators in a row.
 * @param {string} symbol - One of '+', '-', '×', '÷'
 */
function appendOperator(symbol) {
  if (calculatorState.errorActive) clearDisplay();

  // Guard: empty calculation with no digits typed yet at all.
  if (calculatorState.currentOperand === '' && calculatorState.previousOperand === '') {
    return;
  }

  // If an operator was already chosen and user is still overwriting
  // (i.e. they pressed operator twice without typing a number),
  // just swap the operator instead of stacking multiple operators.
  if (calculatorState.operator && calculatorState.overwrite) {
    calculatorState.operator = symbol;
    updateDisplay();
    highlightActiveOperator(symbol);
    return;
  }

  // If there's already a pending operation, resolve it first
  // to support chained calculations (e.g. 5 + 3 + 2).
  if (calculatorState.operator && !calculatorState.overwrite) {
    calculate();
  }

  calculatorState.operator = symbol;
  calculatorState.previousOperand = calculatorState.currentOperand;
  calculatorState.overwrite = true;

  updateDisplay();
  highlightActiveOperator(symbol);
}

/**
 * Performs the pending calculation using previousOperand,
 * operator, and currentOperand. Handles divide-by-zero and
 * invalid-expression errors gracefully.
 */
function calculate() {
  if (calculatorState.errorActive) return;

  const prev = parseFloat(calculatorState.previousOperand);
  const current = parseFloat(calculatorState.currentOperand);

  // Guard: no operator selected, or missing operands (empty calculation).
  if (calculatorState.operator === null || isNaN(prev) || isNaN(current)) {
    return;
  }

  let result;

  switch (calculatorState.operator) {
    case '+':
      result = prev + current;
      break;
    case '-':
      result = prev - current;
      break;
    case '×':
      result = prev * current;
      break;
    case '÷':
      if (current === 0) {
        showError('Cannot divide by zero');
        return;
      }
      result = prev / current;
      break;
    default:
      // Invalid / unrecognized operator — treat as invalid expression.
      showError('Invalid expression');
      return;
  }

  // Guard against floating point precision issues (e.g. 0.1 + 0.2).
  result = Math.round((result + Number.EPSILON) * 1e10) / 1e10;

  if (!isFinite(result)) {
    showError('Result is too large');
    return;
  }

  calculatorState.previousOperand = '';
  calculatorState.operator = null;
  calculatorState.currentOperand = result.toString();
  calculatorState.overwrite = true;

  clearActiveOperatorHighlight();
  updateDisplay();
}

/**
 * Resets the calculator to its initial state (AC button).
 */
function clearDisplay() {
  calculatorState.currentOperand = '0';
  calculatorState.previousOperand = '';
  calculatorState.operator = null;
  calculatorState.overwrite = true;
  clearError();
  clearActiveOperatorHighlight();
  updateDisplay();
}

/**
 * Deletes the last character of the current operand (⌫ button).
 * If only one character remains, resets to '0'.
 */
function deleteLast() {
  if (calculatorState.errorActive) {
    clearDisplay();
    return;
  }

  if (calculatorState.overwrite) {
    // Nothing meaningful to delete if we're about to overwrite.
    return;
  }

  calculatorState.currentOperand = calculatorState.currentOperand.slice(0, -1);

  if (calculatorState.currentOperand === '' || calculatorState.currentOperand === '-') {
    calculatorState.currentOperand = '0';
    calculatorState.overwrite = true;
  }

  updateDisplay();
}

/**
 * Toggles the sign of the current operand between positive and negative.
 */
function toggleSign() {
  if (calculatorState.errorActive) return;
  if (calculatorState.currentOperand === '0') return;

  if (calculatorState.currentOperand.startsWith('-')) {
    calculatorState.currentOperand = calculatorState.currentOperand.slice(1);
  } else {
    calculatorState.currentOperand = '-' + calculatorState.currentOperand;
  }

  updateDisplay();
}

/**
 * Converts the current operand into a percentage value.
 * If a previous operand + operator exist, calculates the percentage
 * relative to the previous operand (e.g. 200 + 10% = 220).
 * Otherwise simply divides the current operand by 100.
 */
function calculatePercentage() {
  if (calculatorState.errorActive) return;

  const current = parseFloat(calculatorState.currentOperand);
  if (isNaN(current)) return;

  let result;

  if (calculatorState.operator && calculatorState.previousOperand !== '') {
    const prev = parseFloat(calculatorState.previousOperand);
    result = (prev * current) / 100;
  } else {
    result = current / 100;
  }

  result = Math.round((result + Number.EPSILON) * 1e10) / 1e10;
  calculatorState.currentOperand = result.toString();
  calculatorState.overwrite = false;
  updateDisplay();
}

/* =========================================================
   Display / UI Functions
   ========================================================= */

/**
 * Syncs the DOM display elements with the current calculator state,
 * and auto-resizes text for long expressions.
 */
function updateDisplay() {
  currentOperandEl.textContent = calculatorState.errorActive
    ? 'Error'
    : formatNumber(calculatorState.currentOperand);

  if (calculatorState.operator && calculatorState.previousOperand !== '') {
    previousOperandEl.textContent =
      `${formatNumber(calculatorState.previousOperand)} ${calculatorState.operator}`;
  } else {
    previousOperandEl.textContent = '';
  }

  autoResizeText();

  // UPGRADE 5: replay the pop-in animation on every value change.
  currentOperandEl.classList.remove('update');
  // Force reflow so the animation restarts even on consecutive updates.
  void currentOperandEl.offsetWidth;
  currentOperandEl.classList.add('update');
}

/**
 * Automatically shrinks the current-operand font size as the
 * expression grows longer, so long numbers stay on one line.
 */
function autoResizeText() {
  const length = currentOperandEl.textContent.length;
  let fontSize = 2.75; // rem, matches CSS default (clamp max)

  if (length > 14) {
    fontSize = 1.3;
  } else if (length > 11) {
    fontSize = 1.6;
  } else if (length > 8) {
    fontSize = 2.1;
  }

  currentOperandEl.style.fontSize = `${fontSize}rem`;
}

/**
 * Highlights the currently selected operator button for visual feedback.
 * @param {string} symbol
 */
function highlightActiveOperator(symbol) {
  clearActiveOperatorHighlight();
  const activeBtn = document.querySelector(
    `.btn-operator[data-operator="${symbol}"]`
  );
  if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Removes the highlighted state from all operator buttons.
 */
function clearActiveOperatorHighlight() {
  document.querySelectorAll('.btn-operator').forEach((btn) =>
    btn.classList.remove('active')
  );
}

/**
 * Applies a brief "pressed" animation class to a button,
 * used for both mouse clicks and keyboard input.
 * @param {HTMLElement} button
 */
function animateButtonPress(button) {
  if (!button) return;
  button.classList.add('pressed');
  setTimeout(() => button.classList.remove('pressed'), 120);
}

/**
 * UPGRADE 4: Spawns a Material-style ripple span inside a button,
 * centered on the click/tap position (or the button's center for
 * keyboard-triggered presses), then removes it once the animation ends.
 * @param {HTMLElement} button
 * @param {MouseEvent|KeyboardEvent} [event]
 */
function createRipple(button, event) {
  if (!button) return;

  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);

  // Use pointer coordinates when available (mouse/touch), otherwise
  // fall back to the button's center (keyboard-triggered presses).
  const originX = event && typeof event.clientX === 'number' ? event.clientX : rect.left + rect.width / 2;
  const originY = event && typeof event.clientY === 'number' ? event.clientY : rect.top + rect.height / 2;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${originX - rect.left - size / 2}px`;
  ripple.style.top = `${originY - rect.top - size / 2}px`;

  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

/* =========================================================
   Event Handling
   ========================================================= */

/**
 * Central click handler for the button grid (event delegation).
 */
buttonsContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.btn');
  if (!button) return;

  animateButtonPress(button);
  createRipple(button, event); // NEW — Upgrade 4 ripple effect
  handleAction(button);
});

/**
 * UPGRADE 1: Theme toggle button click handler — cycles the theme
 * and gives the same press feedback as the calculator buttons.
 */
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', (event) => {
    animateButtonPress(themeToggleBtn);
    createRipple(themeToggleBtn, event);
    cycleTheme();
  });
}

/**
 * Routes a button's data-action to the appropriate calculator function.
 * @param {HTMLElement} button
 */
function handleAction(button) {
  const action = button.dataset.action;

  switch (action) {
    case 'number':
      appendNumber(button.dataset.number);
      break;
    case 'decimal':
      appendDecimal();
      break;
    case 'operator':
      appendOperator(button.dataset.operator);
      break;
    case 'calculate':
      calculate();
      break;
    case 'clear':
      clearDisplay();
      break;
    case 'delete':
      deleteLast();
      break;
    case 'toggle-sign':
      toggleSign();
      break;
    case 'percentage':
      calculatePercentage();
      break;
    default:
      // Unknown action — ignore silently.
      break;
  }
}

/* ---------- Keyboard Support ---------- */

/* Maps physical keys to on-screen operator symbols. */
const KEY_TO_OPERATOR = {
  '+': '+',
  '-': '-',
  '*': '×',
  '/': '÷',
};

document.addEventListener('keydown', (event) => {
  const { key } = event;

  if (key >= '0' && key <= '9') {
    appendNumber(key);
    animateButtonPress(document.querySelector(`[data-number="${key}"]`));
    return;
  }

  if (key === '.') {
    appendDecimal();
    animateButtonPress(document.querySelector('[data-action="decimal"]'));
    return;
  }

  if (key in KEY_TO_OPERATOR) {
    const symbol = KEY_TO_OPERATOR[key];
    appendOperator(symbol);
    animateButtonPress(document.querySelector(`[data-operator="${symbol}"]`));
    return;
  }

  if (key === 'Enter' || key === '=') {
    event.preventDefault();
    calculate();
    animateButtonPress(document.querySelector('[data-action="calculate"]'));
    return;
  }

  if (key === 'Backspace') {
    deleteLast();
    animateButtonPress(document.querySelector('[data-action="delete"]'));
    return;
  }

  if (key === 'Escape') {
    clearDisplay();
    animateButtonPress(document.querySelector('[data-action="clear"]'));
    return;
  }

  if (key === '%') {
    calculatePercentage();
    animateButtonPress(document.querySelector('[data-action="percentage"]'));
    return;
  }
});

/* =========================================================
   Initialization
   ========================================================= */
initTheme();   // NEW — Upgrade 1: restore saved theme before first paint
updateDisplay();
