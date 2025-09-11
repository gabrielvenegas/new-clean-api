import type { OlistApiResponse } from "./api-response";

interface OlistOrder {
  id: number;
}

export type OrderResponse = OlistApiResponse<OlistOrder, "pedidos">;
