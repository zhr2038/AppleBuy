document.getElementById('open').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('control.html')}));
document.getElementById('desktop').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('desktop-bridge.html')}));
document.getElementById('checkout').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('checkout-bridge.html')}));
