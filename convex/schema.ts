import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  customers: defineTable({
    olist_customer_id: v.string(),
    one_month_margin_percentage: v.optional(v.number()),
    one_year_margin_percentage: v.optional(v.number()),
    historical_margin_percentage: v.optional(v.number()),
    margins_last_calculated: v.optional(v.number()),
    is_active: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_olist_id", ["olist_customer_id"])
    .index("by_margins_outdated", ["margins_last_calculated"]),
  orders: defineTable({
    olist_order_id: v.string(),
    olist_customer_id: v.string(),
    customer_id: v.id("customers"),
    margin_percentage: v.number(),
    order_date: v.number(),
    total_value: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_olist_order_id", ["olist_order_id"])
    .index("by_customer_id", ["customer_id"])
    .index("by_olist_customer_id", ["olist_customer_id"]),
});
