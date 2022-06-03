interface Currency {
  add(number: Any): Currency;
  subtract(number: Any): Currency;
  multiply(number: Any): Currency;
  divide(number: Any): Currency;
  distribute(count: number): Array<Currency>;
  dollars(): number;
  cents(): number;
  format(opts?: Options | Format): string;
  toString(): string;
  toJSON(): number;
  valueOf(): number;
  intValue: number;
  value: number;
  _settings: Required<Options>;
  _precision: number;
  new (value: Any, opts?: Options): Currency;
}

type Any = number | string | Currency;

type Format = (currency?: Currency, opts?: Options) => string;

interface Options {
  symbol?: string;
  separator?: string;
  decimal?: string;
  errorOnInvalid?: boolean;
  precision?: number;
  increment?: number;
  useVedic?: boolean;
  pattern?: string;
  negativePattern?: string;
  format?: Format;
  fromCents?: boolean;
  groups?: RegExp;
}

const defaults: Options = {
  symbol: "$",
  separator: ",",
  decimal: ".",
  errorOnInvalid: false,
  precision: 2,
  pattern: "!#",
  negativePattern: "-!#",
  format: format as any,
  fromCents: false,
};

const round = (v: number) => Math.round(v);
const pow = (p: number) => Math.pow(10, p);
const rounding = (value: number, increment: number) =>
  round(value / increment) * increment;

const groupRegex = /(\d)(?=(\d{3})+\b)/g;
const vedicRegex = /(\d)(?=(\d\d)+\d\b)/g;

/**
 * Create a new instance of currency.js
 * @param {number|string|currency} value
 * @param {object} [opts]
 */
function currency(this: any, value: Any, opts?: Options): Currency {
  let that = this as Currency;

  if (!(that instanceof currency)) {
    return new (currency as any)(value, opts) as Currency;
  }

  let settings = Object.assign({}, defaults, opts) as Required<Options>,
    precision = pow(settings.precision),
    v = parse(value, settings);

  that.intValue = v;
  that.value = v / precision;

  // Set default incremental value
  settings.increment = settings.increment || 1 / precision;

  // Support vedic numbering systems
  // see: https://en.wikipedia.org/wiki/Indian_numbering_system
  if (settings.useVedic) {
    settings.groups = vedicRegex;
  } else {
    settings.groups = groupRegex;
  }

  // Intended for internal usage only - subject to change
  this._settings = settings;
  this._precision = precision;

  // em...
  return this;
}

function parse(
  value: Any,
  opts: Required<Options>,
  useRounding = true
): number {
  let v = 0,
    { decimal, errorOnInvalid, precision: decimals, fromCents } = opts,
    precision = pow(decimals),
    isNumber = typeof value === "number",
    isCurrency = value instanceof currency;

  if (isCurrency && fromCents) {
    return (value as Currency).intValue;
  }

  if (isNumber || isCurrency) {
    v = isCurrency ? (value as Currency).value : (value as number);
  } else if (typeof value === "string") {
    let regex = new RegExp("[^-\\d" + decimal + "]", "g"),
      decimalString = new RegExp("\\" + decimal, "g");
    v = value
      .replace(/\((.*)\)/, "-$1") // allow negative e.g. (1.99)
      .replace(regex, "") // replace any non numeric values
      .replace(decimalString, ".") as any; // convert any decimal values
    v = v || 0;
  } else {
    if (errorOnInvalid) {
      throw Error("Invalid Input");
    }
    v = 0;
  }

  if (!fromCents) {
    v *= precision; // scale number to integer value
    v = v.toFixed(4) as any; // Handle additional decimal for proper rounding.
  }

  return useRounding ? round(v) : v;
}

/**
 * Formats a currency object
 * @param currency
 * @param {object} [opts]
 */
function format(currency: Currency, settings: Required<Options>) {
  let { pattern, negativePattern, symbol, separator, decimal, groups } =
      settings,
    split = ("" + currency).replace(/^-/, "").split("."),
    dollars = split[0],
    cents = split[1];

  return (currency.value >= 0 ? pattern : negativePattern)
    .replace("!", symbol)
    .replace(
      "#",
      dollars.replace(groups, "$1" + separator) + (cents ? decimal + cents : "")
    );
}

currency.prototype = {
  /**
   * Adds values together.
   * @param {number} number
   * @returns {currency}
   */
  add(this: Currency, number: Any) {
    let { intValue, _settings, _precision } = this;
    return currency(
      (intValue += parse(number, _settings)) /
        (_settings.fromCents ? 1 : _precision),
      _settings
    );
  },

  /**
   * Subtracts value.
   * @param {number} number
   * @returns {currency}
   */
  subtract(number: Any) {
    let { intValue, _settings, _precision } = this;
    return currency(
      (intValue -= parse(number, _settings)) /
        (_settings.fromCents ? 1 : _precision),
      _settings
    );
  },

  /**
   * Multiplies values.
   * @param {number} number
   * @returns {currency}
   */
  multiply(number: Any) {
    let { intValue, _settings } = this;
    return currency(
      (intValue *= number as number) /
        (_settings.fromCents ? 1 : pow(_settings.precision)),
      _settings
    );
  },

  /**
   * Divides value.
   * @param {number} number
   * @returns {currency}
   */
  divide(number: Any) {
    let { intValue, _settings } = this;
    return currency((intValue /= parse(number, _settings, false)), _settings);
  },

  /**
   * Takes the currency amount and distributes the values evenly. Any extra pennies
   * left over from the distribution will be stacked onto the first set of entries.
   * @param {number} count
   * @returns {array}
   */
  distribute(count: number) {
    let { intValue, _precision, _settings } = this,
      distribution = [],
      split = Math[intValue >= 0 ? "floor" : "ceil"](intValue / count),
      pennies = Math.abs(intValue - split * count),
      precision = _settings.fromCents ? 1 : _precision;

    for (; count !== 0; count--) {
      let item = currency(split / precision, _settings);

      // Add any left over pennies
      pennies-- > 0 &&
        (item = item[intValue >= 0 ? "add" : "subtract"](1 / precision));

      distribution.push(item);
    }

    return distribution;
  },

  /**
   * Returns the dollar value.
   * @returns {number}
   */
  dollars() {
    return ~~this.value;
  },

  /**
   * Returns the cent value.
   * @returns {number}
   */
  cents() {
    let { intValue, _precision } = this;
    return ~~(intValue % _precision);
  },

  /**
   * Formats the value as a string according to the formatting settings.
   * @param {boolean} useSymbol - format with currency symbol
   * @returns {string}
   */
  format(options?: Options | Format) {
    let { _settings } = this;

    if (typeof options === "function") {
      return options(this, _settings);
    }

    return _settings.format(this, Object.assign({}, _settings, options));
  },

  /**
   * Formats the value as a string according to the formatting settings.
   * @returns {string}
   */
  toString() {
    let { intValue, _precision, _settings } = this;
    return rounding(intValue / _precision, _settings.increment).toFixed(
      _settings.precision
    );
  },

  /**
   * Value for JSON serialization.
   * @returns {float}
   */
  toJSON() {
    return this.value;
  },

  valueOf() {
    return Number(this.toString());
  },
};

export default currency;
