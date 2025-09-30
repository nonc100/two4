const mongoose = require('mongoose');

const cvdSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    tf: { type: String, required: true, index: true },
    t: { type: Number, required: true, index: true },
    g0: { type: Number, default: 0 },
    g1: { type: Number, default: 0 },
    g2: { type: Number, default: 0 },
    g3: { type: Number, default: 0 },
    g4: { type: Number, default: 0 },
    all: { type: Number, default: 0 },
    price: { type: Number, default: null },
  },
  { timestamps: false, versionKey: false }
);

cvdSchema.index({ symbol: 1, tf: 1, t: 1 }, { unique: true });

const heatmapLevelSchema = new mongoose.Schema(
  {
    binLow: { type: Number, default: null },
    binHigh: { type: Number, default: null },
    volUSDT: { type: Number, default: null },
  },
  { _id: false }
);

const heatmapSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    tf: { type: String, required: true, index: true },
    t: { type: Number, required: true, index: true },
    binLow: { type: Number, default: null },
    binHigh: { type: Number, default: null },
    volUSDT: { type: Number, default: null },
    bids: { type: [[Number]], default: [] },
    asks: { type: [[Number]], default: [] },
    lastPrice: { type: Number, default: null },
    levels: { type: [heatmapLevelSchema], default: undefined },
  },
  { timestamps: false, versionKey: false }
);

heatmapSchema.index({ symbol: 1, tf: 1, t: 1 }, { unique: true });

const priceSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    tf: { type: String, required: true, index: true },
    t: { type: Number, required: true, index: true },
    close: { type: Number, default: null },
    volume: { type: Number, default: null },
  },
  { timestamps: false, versionKey: false }
);

priceSchema.index({ symbol: 1, tf: 1, t: 1 }, { unique: true });

const liquidationEventSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, index: true },
    eventTime: { type: Number, required: true, index: true },
    side: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    notional: { type: Number, required: true },
  },
  { timestamps: false, versionKey: false }
);

liquidationEventSchema.index(
  { symbol: 1, eventTime: 1, side: 1, price: 1, quantity: 1 },
  { unique: true }
);
liquidationEventSchema.index({ symbol: 1, eventTime: -1 });
liquidationEventSchema.index({ eventTime: -1 });

const CVDModel =
  mongoose.models.CVD || mongoose.model('CVD', cvdSchema, 'cvd_records');
const HeatmapModel =
  mongoose.models.Heatmap || mongoose.model('Heatmap', heatmapSchema, 'heatmap_records');
const PriceModel =
  mongoose.models.Price || mongoose.model('Price', priceSchema, 'price_records');
const LiquidationEventModel =
  mongoose.models.LiquidationEvent ||
  mongoose.model('LiquidationEvent', liquidationEventSchema, 'liquidation_events');

module.exports = {
  CVDModel,
  HeatmapModel,
  PriceModel,
  LiquidationEventModel,
};
