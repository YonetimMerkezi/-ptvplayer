// Arka plan işçisi girişi (dist/app/js/isci.js): ana iş parçacığından gelen ayrıştırma işlerini yürütür.
import 'core-js/stable';
import { isle } from './isci-cekirdek.js';

self.onmessage = (e) => {
  self.postMessage(isle(e.data));
};
