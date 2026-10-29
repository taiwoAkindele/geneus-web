// The shared contract uses hasOwn. Retain support for older Android browsers.
Object.hasOwn ??= (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
