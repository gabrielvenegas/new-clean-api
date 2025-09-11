import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

export const batchInsert = mutation({
  args: {
    customers: v.array(
      v.object({
        olist_customer_id: v.string(),
        one_month_margin_percentage: v.optional(v.number()),
        one_year_margin_percentage: v.optional(v.number()),
        historical_margin_percentage: v.optional(v.number()),
        is_active: v.boolean(),
        created_at: v.number(),
        updated_at: v.number(),
      }),
    ),
  },
  handler: async (ctx, { customers }) => {
    const results = [];

    for (const customer of customers) {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_olist_id", (q) =>
          q.eq("olist_customer_id", customer.olist_customer_id),
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("customers", customer);
        results.push(id);
      }
    }

    return results;
  },
});

// Add mutation to update margins later
export const updateMargins = mutation({
  args: {
    olistCustomerId: v.string(),
    one_month_margin_percentage: v.optional(v.number()),
    one_year_margin_percentage: v.optional(v.number()),
    historical_margin_percentage: v.optional(v.number()),
  },
  handler: async (ctx, { olistCustomerId, ...margins }) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_olist_id", (q) =>
        q.eq("olist_customer_id", olistCustomerId),
      )
      .first();

    if (!customer) {
      throw new Error(
        `Customer with olist_customer_id ${olistCustomerId} not found`,
      );
    }

    return await ctx.db.patch(customer._id, {
      ...margins,
      margins_last_calculated: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const getByOlistId = query({
  args: { olistCustomerId: v.string() },
  handler: async (ctx, { olistCustomerId }) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_olist_id", (q) =>
        q.eq("olist_customer_id", olistCustomerId),
      )
      .first();
  },
});

export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();
    return customers.length;
  },
});

// Useful query to get customers with margin data
export const getWithMargins = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    return await ctx.db
      .query("customers")
      .filter((q) => q.neq(q.field("one_month_margin_percentage"), undefined))
      .take(limit);
  },
});

export const getOutdatedCustomers = query({
  args: {
    stalenessThreshold: v.number(), // e.g., 4 hours in milliseconds
    limit: v.number(),
  },
  handler: async (ctx, { stalenessThreshold, limit }) => {
    const now = Date.now();
    const thresholdTimestamp = now - stalenessThreshold;

    return await ctx.db
      .query("customers")
      .withIndex("by_margins_outdated")
      .filter((q) =>
        q.and(
          q.neq(q.field("is_active"), false),
          q.or(
            q.lt(q.field("margins_last_calculated"), thresholdTimestamp),
            q.eq(q.field("margins_last_calculated"), undefined),
          ),
        ),
      )
      .take(limit);
  },
});

export const deactivateCustomer = mutation({
  args: {
    id: v.id("customers"),
  },
  handler: async (ctx, { id }) => {
    try {
      return await ctx.db.patch(id, {
        is_active: false,
        updated_at: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to deactivate customer: ${error}`);
    }
  },
});
