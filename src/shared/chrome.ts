export function getActiveTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      const [tab] = tabs;
      if (!tab?.id) {
        reject(new Error("No active tab found."));
        return;
      }

      resolve(tab);
    });
  });
}

export function sendTabMessage<TResponse>(
  tabId: number,
  message: unknown,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response);
    });
  });
}
