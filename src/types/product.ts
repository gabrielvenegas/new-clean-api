export interface Product {
	product_id: string;
	order_id: string;
	order_item_id: number;
	seller_id: string;
	price: number;
	freight_value: number;
	product_category_name?: string;
}
