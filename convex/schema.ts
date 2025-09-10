import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  customers: defineTable({
    olist_customer_id: v.string(),
    one_month_margin_percentage: v.optional(v.number()),
    one_year_margin_percentage: v.optional(v.number()),
    historical_margin_percentage: v.optional(v.number()),
    margins_last_calculated: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_olist_id", ["olist_customer_id"])
    .index("by_margins_outdated", ["margins_last_calculated"]),
});
