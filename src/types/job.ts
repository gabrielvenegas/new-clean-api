import type { Id } from "../../convex/_generated/dataModel";

export enum JobType {
  FETCH_CUSTOMERS = "fetch_customers",
  FETCH_CUSTOMER_ORDERS = "fetch_customer_orders",
  FETCH_ORDER_PRODUCTS = "fetch_order_products",
  CALCULATE_MARGINS = "calculate_margins",
  PROCESS_CUSTOMER_MARGINS = "process_customer_margins",
  QUEUE_PENDING_ORDERS = "queue_pending_orders",
}

export interface BaseJobData {
  id: string;
  createdAt: Date;
}

export interface ProcessCustomerMarginsJobData extends BaseJobData {
  customerId: string;
}

export interface FetchCustomersJobData extends BaseJobData {
  page: number;
  limit: number;
}

export interface FetchCustomerOrdersJobData extends BaseJobData {
  customerId: Id<"customers">;
  olistCustomerId: string;
  page: number;
  limit: number;
}

export interface FetchOrderProductsJobData extends BaseJobData {
  orderId: string;
  customerId: string;
  page: number;
  limit: number;
}

export interface CalculateMarginsJobData extends BaseJobData {
  orderId: string;
  customerId: string;
}

export type JobData =
  | FetchCustomersJobData
  | FetchCustomerOrdersJobData
  | FetchOrderProductsJobData
  | CalculateMarginsJobData;
