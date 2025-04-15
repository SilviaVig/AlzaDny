const discountInput = document.getElementById('discount-input');
const updateDiscountButton = document.getElementById('update-discount');
const actionButton = document.getElementById('load-and-filter');
const statusElement = document.getElementById('status');
const optimizeMemoryCheckbox = document.getElementById('optimize-memory');

const DEFAULT_DISCOUNT_PERCENTAGE = 50;
const MIN_DISCOUNT_VALUE = 0;
const MAX_DISCOUNT_VALUE = 100;

let minDiscountPercentage = DEFAULT_DISCOUNT_PERCENTAGE;
let isLoading = false;
let isStopped = false;
let currentTabId = null;

function getTranslatedString(key) {
  return chrome.i18n.getMessage(key);
}

function updateInterfaceTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (element.tagName === 'INPUT' && element.type === 'submit') {
      element.value = getTranslatedString(key);
    } else {
      element.textContent = getTranslatedString(key);
    }
  });
}

async function retrieveActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        currentTabId = tabs[0].id;
        resolve(currentTabId);
      } else {
        resolve(null);
      }
    });
  });
}

function saveUserPreferences() {
  if (!currentTabId) return;
  
  chrome.storage.local.set({
    [`discount_${currentTabId}`]: minDiscountPercentage,
    [`optimize_${currentTabId}`]: optimizeMemoryCheckbox.checked
  });
}

async function loadUserPreferences() {
  await retrieveActiveTabId();
  if (!currentTabId) return;
  
  chrome.storage.local.get([`discount_${currentTabId}`, `optimize_${currentTabId}`], function(result) {
    applyLoadedPreferences(result);
    initializeContentScript();
  });
}

function applyLoadedPreferences(preferences) {
  if (preferences[`discount_${currentTabId}`] !== undefined) {
    minDiscountPercentage = preferences[`discount_${currentTabId}`];
    discountInput.value = minDiscountPercentage;
  }
  
  if (preferences[`optimize_${currentTabId}`] !== undefined) {
    optimizeMemoryCheckbox.checked = preferences[`optimize_${currentTabId}`];
  }
}

function initializeContentScript() {
  sendMessageToContentScript({
    action: 'initWithSettings',
    minDiscountPercentage: minDiscountPercentage,
    optimizeMemory: optimizeMemoryCheckbox.checked,
    tabId: currentTabId
  });
  
  sendMessageToContentScript({
    action: 'getStatus'
  });
}

function sendMessageToContentScript(message) {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, message);
  }
}

function isValidDiscountValue(value) {
  return !isNaN(value) && value >= MIN_DISCOUNT_VALUE && value <= MAX_DISCOUNT_VALUE;
}

function handleDiscountUpdate() {
  const newValue = parseInt(discountInput.value);
  
  if (isValidDiscountValue(newValue)) {
    minDiscountPercentage = newValue;
    notifyContentScriptOfDiscountChange();
    updateDiscountStatusMessage();
    saveUserPreferences();
  }
}

function notifyContentScriptOfDiscountChange() {
  sendMessageToContentScript({
    action: 'updateDiscount',
    minDiscountPercentage: minDiscountPercentage,
    tabId: currentTabId
  });
}

function updateDiscountStatusMessage() {
  statusElement.textContent = getTranslatedString('discountUpdated').replace('$PERCENT$', minDiscountPercentage);
}

function handleStartLoading() {
  isLoading = true;
  isStopped = false;
  updateButtonToStopState();
  
  sendMessageToContentScript({
    action: 'loadAllProducts',
    optimizeMemory: optimizeMemoryCheckbox.checked,
    minDiscountPercentage: minDiscountPercentage 
  });
  
  statusElement.textContent = getTranslatedString('loadingAndFiltering');
}

function handleResumeLoading() {
  isStopped = false;
  updateButtonToStopState();
  
  sendMessageToContentScript({
    action: 'resumeLoading'
  });
  
  statusElement.textContent = getTranslatedString('resuming');
}

function handleStopLoading() {
  isStopped = true;
  updateButtonToResumeState();
  
  sendMessageToContentScript({
    action: 'stopLoading'
  });
  
  statusElement.textContent = getTranslatedString('stopped');
}

function updateButtonToStopState() {
  actionButton.textContent = getTranslatedString('stopToScroll');
  actionButton.setAttribute('data-i18n', 'stopToScroll');
}

function updateButtonToResumeState() {
  actionButton.textContent = getTranslatedString('resume');
  actionButton.setAttribute('data-i18n', 'resume');
}

function updateButtonToInitialState() {
  actionButton.textContent = getTranslatedString('loadAndFilter');
  actionButton.setAttribute('data-i18n', 'loadAndFilter');
}

function handleActionButtonClick() {
  if (!isLoading) {
    handleStartLoading();
  } else if (isStopped) {
    handleResumeLoading();
  } else {
    handleStopLoading();
  }
  
  saveUserPreferences();
}

function processStatusUpdate(request) {
  statusElement.textContent = request.message;
}

function processStateUpdate(request) {
  updateLoadingState(request);
  updateStoppedState(request);
  updateButtonAppearance();
  updateDiscountValueIfNeeded(request);
}

function updateLoadingState(request) {
  if (request.isLoading !== undefined) {
    isLoading = request.isLoading;
  }
}

function updateStoppedState(request) {
  if (request.isStopped !== undefined) {
    isStopped = request.isStopped;
  }
}

function updateButtonAppearance() {
  if (isLoading) {
    if (isStopped) {
      updateButtonToResumeState();
    } else {
      updateButtonToStopState();
    }
  } else {
    updateButtonToInitialState();
  }
}

function updateDiscountValueIfNeeded(request) {
  if (request.minDiscountPercentage !== undefined) {
    minDiscountPercentage = request.minDiscountPercentage;
    discountInput.value = minDiscountPercentage;
  }
}

function setupEventListeners() {
  updateDiscountButton.addEventListener('click', handleDiscountUpdate);
  actionButton.addEventListener('click', handleActionButtonClick);
  optimizeMemoryCheckbox.addEventListener('change', saveUserPreferences);
}

function handleIncomingMessage(request, sender, sendResponse) {
  if (request.action === 'getTabId') {
    sendResponse({ tabId: currentTabId });
    return true; // Keep the message channel open for the asynchronous response
  }
  
  if (sender.tab && sender.tab.id === currentTabId) {
    if (request.action === 'updateStatus') {
      processStatusUpdate(request);
    } else if (request.action === 'updateState') {
      processStateUpdate(request);
    }
  }
}

function initializePopup() {
  updateInterfaceTranslations();
  loadUserPreferences();
  setupEventListeners();
}

// Set up message listener
chrome.runtime.onMessage.addListener(handleIncomingMessage);

// Initialize when popup is loaded
document.addEventListener('DOMContentLoaded', initializePopup);