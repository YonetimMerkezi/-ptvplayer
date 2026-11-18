// Uzaktan kumanda tuşları → eylem adları. webOS: Geri 461, renkli tuşlar 403–406, oynatma tuşları 412–417, kanal 427/428.
const EYLEM = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok',
  461: 'back', 8: 'back', 27: 'back', 10009: 'back',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  415: 'play', 19: 'pause', 413: 'stop', 412: 'rw', 417: 'ff',
  427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown', 457: 'info',
};

export function actionOf(code) {
  if (code >= 48 && code <= 57) return 'num' + (code - 48);
  if (code >= 96 && code <= 105) return 'num' + (code - 96);
  return EYLEM[code] || null;
}

export const rakam = (action) => (/^num\d$/.test(action || '') ? Number(action.slice(3)) : -1);
