import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const batchInsert = mutation({
  args: {
    orders: v.array(
      v.object({
        olist_order_id: v.string(),
        olist_customer_id: v.string(),
        customer_id: v.id("customers"),
        margin_percentage: v.number(),
        order_date: v.number(),
        total_value: v.number(),
        created_at: v.number(),
        updated_at: v.number(),
      }),
    ),
  },
  handler: async (ctx, { orders }) => {
    const results = [];

    for (const order of orders) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_olist_order_id", (q) =>
          q.eq("olist_order_id", order.olist_order_id),
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("orders", order);
        results.push(id);
      }
    }

    return results;
  },
});

export const getByCustomerId = query({
  args: {
    customerId: v.id("customers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { customerId, limit = 1000 }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_customer_id", (q) => q.eq("customer_id", customerId))
      .take(limit);
  },
});

export const getByOlistCustomerId = query({
  args: {
    olistCustomerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { olistCustomerId, limit = 1000 }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_olist_customer_id", (q) =>
        q.eq("olist_customer_id", olistCustomerId),
      )
      .take(limit);
  },
});

export const deleteByCustomerId = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, { customerId }) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer_id", (q) => q.eq("customer_id", customerId))
      .collect();

    for (const order of orders) {
      await ctx.db.delete(order._id);
    }

    return orders.length;
  },
});

export const updateOrderMargin = mutation({
  args: {
    orders: v.array(
      v.object({
        id: v.id("orders"),
        margin: v.number(),
      }),
    ),
  },
  handler: async (ctx, { orders }) => {
    const results = [];
    for (const order of orders) {
      await ctx.db.patch(order.id, { margin_percentage: order.margin });
      results.push(order.id);
    }
    return results;
  },
});
