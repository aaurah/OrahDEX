const custom = Symbol.for("nodejs.util.inspect.custom");

function inspect(value) {
  return String(value);
}
inspect.custom = custom;

function format(...args) {
  return args.map(String).join(" ");
}

function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, value) => (err ? reject(err) : resolve(value)));
    });
}

function inherits(ctor, superCtor) {
  ctor.prototype = Object.create(superCtor?.prototype ?? Object.prototype);
  ctor.super_ = superCtor;
}

function deprecate(fn) {
  return fn;
}

const util = {
  custom,
  inspect,
  format,
  promisify,
  inherits,
  deprecate,
  debuglog: () => () => {},
  log: (...args) => console.log(...args),
};

export { custom, inspect, format, promisify, inherits, deprecate };
export default util;
