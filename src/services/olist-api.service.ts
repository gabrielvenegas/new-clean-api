import type { CustomersResponse, OlistCustomer } from "@/types/olist/contact";
import type { OrderResponse } from "@/types/olist/order";

export class OlistApiService {
  private baseUrl = process.env.OLIST_API_URL || "https://api.tiny.com.br/api2";
  private apiKey = process.env.OLIST_API_KEY;

  constructor() {
    if (!this.apiKey) {
      throw new Error("OLIST_API_KEY environment variable is required");
    }
  }

  async fetchCustomers(page = 1, limit = 50): Promise<CustomersResponse> {
    const url = `${this.baseUrl}/contatos.pesquisa.php?token=${this.apiKey}&formato=JSON&situacao=Ativo&pagina=${page}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("RATE_LIMITED");
        }
        throw new Error(
          `API Error: ${response.status} - ${response.statusText}`,
        );
      }

      const data = (await response.json()) as CustomersResponse;
      return data;
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        throw error; // Re-throw rate limit errors for retry logic
      }
      throw new Error(`Failed to fetch customers: ${error}`);
    }
  }

  async fetchCustomerOrders(customerName: string, page = 1, limit = 50) {
    const url = `${this.baseUrl}/pedidos.pesquisa.php?token=${this.apiKey}&formato=JSON&cliente=${customerName}&pagina=${page}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("RATE_LIMITED");
      throw new Error(`API Error: ${response.status}`);
    }

    const data = (await response.json()) as OrderResponse;
    return data;
  }

  async fetchCustomerById(customerId: string) {
    const url = `${this.baseUrl}/contato.obter.php?token=${this.apiKey}&formato=JSON&id=${customerId}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("RATE_LIMITED");
      throw new Error(`API Error: ${response.status}`);
    }

    const data = (await response.json()) as { retorno: OlistCustomer };
    return data;
  }
}
