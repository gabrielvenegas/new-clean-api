import type { Id } from "../../convex/_generated/dataModel";

export interface Order {
  olist_order_id: string;
  olist_customer_id: string;
  customer_id: Id<"customers">;
  margin_percentage: number;
  order_date: number;
  total_value: number;
  created_at: number;
  updated_at: number;
}
