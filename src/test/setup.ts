import '@testing-library/jest-dom';

// jsdom does not implement navigator.geolocation — provide a stub so tests can spy on it.
if (!('geolocation' in navigator)) {
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: () => {},
      watchPosition: () => 0,
      clearWatch: () => {},
    },
    configurable: true,
  });
}
