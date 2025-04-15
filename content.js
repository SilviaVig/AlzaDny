const COUPON_PREFIXES = ['ALZADNY', 'ALZADNI']; // Support both Czech and Slovak formats
let MIN_DISCOUNT_PERCENTAGE = 50;
let OPTIMIZE_MEMORY = false;
const MAX_NO_NEW_PRODUCTS_ATTEMPTS = 3;
const PRODUCT_SELECTOR = '.box.browsingitem';
const HIGHLIGHTED_PRODUCT_SELECTOR = '.box.browsingitem.alza-dny-filter-highlight';
const NON_HIGHLIGHTED_SELECTOR = '.box.browsingitem:not(.alza-dny-filter-highlight)';

let processedProducts = new Set();
let isLoading = false;
let lastProductCount = 0;
let noNewProductsCount = 0;
let shouldStop = false;

(function initialize() {
    loadSavedSettings();

    // Setup MutationObserver to detect category changes without full page reload
    const bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.classList.contains('container') || node.classList.contains('boxes'))) {
                        loadSavedSettings();
                        updateStatusMessage(`Currently filtering: ${MIN_DISCOUNT_PERCENTAGE}%+ discount`, 'currentlyFiltering', [MIN_DISCOUNT_PERCENTAGE.toString()]);
                        break;
                    }
                }
            }
        }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
})();

function loadSavedSettings() {
    chrome.storage.local.get(null, function(items) {
        chrome.runtime.sendMessage({ action: 'getTabId' }, function(response) {
            if (response && response.tabId) {
                const tabId = response.tabId;
                
                if (items[`discount_${tabId}`] !== undefined) {
                    MIN_DISCOUNT_PERCENTAGE = items[`discount_${tabId}`];
                }
                
                if (items[`optimize_${tabId}`] !== undefined) {
                    OPTIMIZE_MEMORY = items[`optimize_${tabId}`];
                }
            }
        });
    });
}

function extractDiscountPercentage(couponCode) {
    for (const prefix of COUPON_PREFIXES) {
        if (couponCode.startsWith(prefix)) {
            const number = parseInt(couponCode.replace(prefix, ''));
            return isNaN(number) ? 0 : number;
        }
    }
    return 0;
}

function hasValidDiscount(productElement) {
    const couponElements = productElement.querySelectorAll('.coupon-block__label--code');
    for (const couponElement of couponElements) {
        const couponCode = couponElement.textContent.trim();
        const discountPercentage = extractDiscountPercentage(couponCode);
        if (discountPercentage >= MIN_DISCOUNT_PERCENTAGE) {
            return true;
        }
    }
    return false;
}

function processProductElement(productElement) {
    const productId = productElement.getAttribute('data-id');
    if (processedProducts.has(productId)) return;
    
    processedProducts.add(productId);
    
    if (!hasValidDiscount(productElement)) {
        hideNonDiscountedProduct(productElement);
    } else {
        highlightDiscountedProduct(productElement);
    }
}

function hideNonDiscountedProduct(productElement) {
    if (OPTIMIZE_MEMORY) {
        productElement.remove();
    } else {
        productElement.style.display = 'none';
    }
}

function highlightDiscountedProduct(productElement) {
    if (!OPTIMIZE_MEMORY) {
        productElement.style.display = '';
    }
    productElement.classList.add('alza-dny-filter-highlight');
    productElement.setAttribute('data-discount', `${MIN_DISCOUNT_PERCENTAGE}%+ OFF`);
}

function processUnhandledProducts() {
    const products = document.querySelectorAll(NON_HIGHLIGHTED_SELECTOR);
    products.forEach(processProductElement);
}

function attemptToLoadMoreProducts() {
    const loadMoreButton = document.querySelector('.js-button-more.button-more:not(.hdn)');
    if (loadMoreButton) {
        loadMoreButton.click();
        return true;
    }
    return false;
}

function getProductCounts() {
    return {
        current: document.querySelectorAll(NON_HIGHLIGHTED_SELECTOR).length,
        discounted: document.querySelectorAll(HIGHLIGHTED_PRODUCT_SELECTOR).length,
        total: getTotalProductsCount() || 0
    };
}

function handleLoadingCompletion() {
    isLoading = false;
    const counts = getProductCounts();
    generateStatusMessage({
        currentProductCount: counts.current,
        total: counts.total,
        discountedCount: counts.discounted
    }, false); // Force completed state
}

function handleNoNewProducts() {
    noNewProductsCount++;
    if (noNewProductsCount >= MAX_NO_NEW_PRODUCTS_ATTEMPTS) {
        if (!attemptToLoadMoreProducts()) {
            handleLoadingCompletion();
            return true; // Loading completed
        }
        noNewProductsCount = 0;
    }
    return false; // Loading continues
}

function updateLoadingProgressMessage(counts) {
    generateStatusMessage({
        currentProductCount: counts.current,
        total: counts.total,
        discountedCount: counts.discounted
    }, true); // Force loading state
}

function processNewProductsIfLoaded(counts) {
    if (counts.current > lastProductCount) {
        const newProducts = Array.from(document.querySelectorAll(NON_HIGHLIGHTED_SELECTOR));
        newProducts.forEach(processProductElement);
        return true;
    }
    return false;
}

function monitorProductLoading() {
    if (shouldStop) {
        setTimeout(monitorProductLoading, 1000);
        return;
    }

    const counts = getProductCounts();
    
    processNewProductsIfLoaded(counts);
    
    if (counts.current === lastProductCount) {
        if (handleNoNewProducts()) {
            return; // Loading completed
        }
    } else {
        noNewProductsCount = 0;
        lastProductCount = counts.current;
        updateLoadingProgressMessage(counts);
    }
    
    if (isLoading) {
        setTimeout(monitorProductLoading, 200);
    }
}

function updateStatusMessage(message, messageKey, placeholders) {
    let localizedMessage = message;
    if (messageKey) {
        localizedMessage = chrome.i18n.getMessage(messageKey, placeholders);
    }
    
    chrome.runtime.sendMessage({
        action: 'updateStatus',
        message: localizedMessage
    });
}

function getCurrentFilterStatus() {
    const counts = getProductCounts();
    
    return {
        isLoading,
        shouldStop,
        currentProductCount: counts.current,
        discountedCount: counts.discounted,
        minDiscountPercentage: MIN_DISCOUNT_PERCENTAGE
    };
}

function startProductLoading(optimizeMemoryFlag = false, minDiscountPercentageValue = null) {
    if (isLoading) return;
    
    isLoading = true;
    shouldStop = false;
    noNewProductsCount = 0;
    lastProductCount = 0;
    OPTIMIZE_MEMORY = optimizeMemoryFlag;
    
    if (minDiscountPercentageValue !== null) {
        MIN_DISCOUNT_PERCENTAGE = minDiscountPercentageValue;
    }
    
    resetProductDisplay();
    updateStatusMessage('Loading products...', 'loading');
    
    setTimeout(monitorProductLoading, 1000);
}

function resetProductDisplay() {
    const products = document.querySelectorAll(PRODUCT_SELECTOR);
    products.forEach(product => {
        product.classList.remove('alza-dny-filter-highlight');
        if (!OPTIMIZE_MEMORY) {
            product.style.display = '';
        }
    });
}

function pauseProductLoading() {
    shouldStop = true;
    
    const counts = getProductCounts();
    
    updateStatusMessage(
        `Stopped: ${counts.current} of ${counts.total} loaded, ${counts.discounted} with ${MIN_DISCOUNT_PERCENTAGE}%+ discount`, 
        'stoppedWithProgress', 
        [counts.current.toString(), counts.total.toString(), counts.discounted.toString(), MIN_DISCOUNT_PERCENTAGE.toString()]
    );
}

function resumeProductLoading() {
    shouldStop = false;
    updateStatusMessage('Resuming...', 'resuming');
    setTimeout(monitorProductLoading, 200);
}

function updateDiscountThreshold(minDiscountPercentage) {
    MIN_DISCOUNT_PERCENTAGE = minDiscountPercentage;
    
    if (!OPTIMIZE_MEMORY) {
        // When NOT in optimize memory mode: show all products first, then refilter
        // This ensures previously hidden products that now match the new criteria will appear
        document.querySelectorAll(PRODUCT_SELECTOR).forEach(product => {
            product.style.display = '';
        });
    }
    
    document.querySelectorAll(HIGHLIGHTED_PRODUCT_SELECTOR).forEach(product => {
        product.setAttribute('data-discount', `${MIN_DISCOUNT_PERCENTAGE}%+ OFF`);
    });
    
    processedProducts.clear();
    processUnhandledProducts();
    
    updateStatusMessage(`Minimum discount updated to ${MIN_DISCOUNT_PERCENTAGE}%`, 'discountUpdated', [MIN_DISCOUNT_PERCENTAGE.toString()]);
}

function getTotalProductsCount() {
    const numberItemElement = document.getElementById('lblNumberItem');
    if (numberItemElement) {
        // Remove any spaces or non-numeric characters before parsing
        const text = numberItemElement.textContent.trim().replace(/\s+/g, '');
        const count = parseInt(text);
        return isNaN(count) ? null : count;
    }
    return null;
}

function generateStatusMessage(status, forceStateOverride = null) {
    let messageKey = null;
    let message = '';
    let placeholders = [];
    
    // Use the provided state if explicitly passed, otherwise use the global state
    const currentState = forceStateOverride !== null ? forceStateOverride : isLoading;
    
    if (currentState) {
        messageKey = 'loadingProgress';
        message = `Loading products... (${status.currentProductCount} of ${status.total} total, ${status.discountedCount} with ${MIN_DISCOUNT_PERCENTAGE}%+ discount)`;
        placeholders = [status.currentProductCount.toString(), status.total.toString(), status.discountedCount.toString(), MIN_DISCOUNT_PERCENTAGE.toString()];
    } else if (status.discountedCount > 0) {
        messageKey = 'foundProducts';
        message = `Loaded ${status.currentProductCount} products. Found ${status.discountedCount} with ${MIN_DISCOUNT_PERCENTAGE}%+ discount.`;
        placeholders = [status.discountedCount.toString(), MIN_DISCOUNT_PERCENTAGE.toString()];
    }
    
    if (message) {
        updateStatusMessage(message, messageKey, placeholders);
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'loadAllProducts') {
        startProductLoading(request.optimizeMemory, request.minDiscountPercentage);
    } else if (request.action === 'stopLoading') {
        pauseProductLoading();
    } else if (request.action === 'resumeLoading') {
        resumeProductLoading();
    } else if (request.action === 'updateDiscount') {
        updateDiscountThreshold(request.minDiscountPercentage);
        
        if (request.tabId) {
            chrome.storage.local.set({
                [`discount_${request.tabId}`]: request.minDiscountPercentage
            });
        }
    } else if (request.action === 'getStatus') {
        const status = getCurrentFilterStatus();
        
        chrome.runtime.sendMessage({
            action: 'updateState',
            isLoading: isLoading,
            isStopped: shouldStop,
            minDiscountPercentage: MIN_DISCOUNT_PERCENTAGE
        });
        
        generateStatusMessage(status);
    } else if (request.action === 'initWithSettings') {
        if (request.minDiscountPercentage !== undefined) {
            MIN_DISCOUNT_PERCENTAGE = request.minDiscountPercentage;
        }
        if (request.optimizeMemory !== undefined) {
            OPTIMIZE_MEMORY = request.optimizeMemory;
        }
    }
});