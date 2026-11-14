export function isModestDevice(nav) {
  return nav.hardwareConcurrency <= 2 || nav.deviceMemory <= 2;
}
