import type { Order } from "@/types/order.js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js"; // Missing import!
import type { Id } from "../../convex/_generated/dataModel.js";
import type { Customer } from "../types/customer.js";

export class ConvexService {
  private client: ConvexHttpClient;

  constructor() {
    const deploymentUrl = process.env.CONVEX_URL;
    if (!deploymentUrl) {
      throw new Error("CONVEX_URL environment variable is required");
    }
    this.client = new ConvexHttpClient(deploymentUrl);
  }

  async getCustomerById(id: Id<"customers">) {
    try {
      const customer = await this.client.query(api.customer.getCustomerById, {
        id,
      });
      return customer;
    } catch (error) {
      throw new Error(`Failed to get customer by ID: ${error}`);
    }
  }

  async saveCustomers(customers: Customer[]) {
    try {
      // Use the generated API, not string paths
      return await this.client.mutation(api.customer.batchInsert, {
        customers,
      });
    } catch (error) {
      throw new Error(`Failed to save customers to Convex: ${error}`);
    }
  }

  async getCustomerExists(olistCustomerId: string): Promise<boolean> {
    try {
      const customer = await this.client.query(api.customer.getByOlistId, {
        olistCustomerId,
      });
      return !!customer;
    } catch (error) {
      return false; // Assume doesn't exist if query fails
    }
  }

  async getCustomerCount(): Promise<number> {
    try {
      return await this.client.query(api.customer.getCount);
    } catch (error) {
      throw new Error(`Failed to get customer count: ${error}`);
    }
  }

  async getPendingMarginCustomers() {
    try {
      return await this.client.query(api.customer.getOutdatedCustomers, {
        stalenessThreshold: 4 * 60 * 60 * 1000,
        limit: 300,
      });
    } catch (error) {
      throw new Error(`Failed to get pending margin customers: ${error}`);
    }
  }

  async updateCustomerMargins(
    olistCustomerId: string,
    margins: {
      one_month_margin_percentage?: number;
      one_year_margin_percentage?: number;
      historical_margin_percentage?: number;
    },
  ) {
    try {
      return await this.client.mutation(api.customer.updateMargins, {
        olistCustomerId,
        ...margins,
      });
    } catch (error) {
      throw new Error(`Failed to update customer margins: ${error}`);
    }
  }

  async deactivateCustomer(id: Id<"customers">) {
    try {
      return await this.client.mutation(api.customer.deactivateCustomer, {
        id,
      });
    } catch (error) {
      throw new Error(`Failed to deactivate customer: ${error}`);
    }
  }

  async storeOrders(customerId: string, orders: Order[]) {
    try {
      return await this.client.mutation(api.order.batchInsert, {
        orders,
      });
    } catch (error) {
      throw new Error(`Failed to store orders: ${error}`);
    }
  }

  async getOrdersByCustomerId(customerId: Id<"customers">) {
    try {
      return await this.client.query(api.order.getByCustomerId, {
        customerId,
      });
    } catch (error) {
      throw new Error(`Failed to get orders by customer ID: ${error}`);
    }
  }

  async updateOrderMargins(orders: { id: Id<"orders">; margin: number }[]) {
    try {
      return await this.client.mutation(api.order.updateOrderMargin, {
        orders,
      });
    } catch (error) {
      throw new Error(`Failed to update order margins: ${error}`);
    }
  }
}
