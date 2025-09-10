export interface OlistCustomer {
  contato: OlistContactDetails;
}

export interface OlistContactDetails {
  id: string;
  codigo: string;
  nome: string;
  fantasia: string;
  tipo_pessoa: string;
  cpf_cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  email: string;
  fone: string;
  id_lista_preco: number;
  id_vendedor: string;
  nome_vendedor: string;
  situacao: string;
  data_criacao: string;
}

interface OlistApiResponse<T, K extends string> {
  retorno: {
    status_processamento: string;
    status: string;
    pagina: number;
    numero_paginas: number;
  } & Record<K, T[]>;
}

type CustomersResponse = OlistApiResponse<OlistCustomer, "contatos">;
// type OrdersResponse = OlistApiResponse<Order, "pedidos">;
// type ProductsResponse = OlistApiResponse<Product, "produtos">;

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

  async fetchCustomerOrders(customerId: string, page = 1, limit = 50) {
    // We'll implement this next for the order worker
    const url = `${this.baseUrl}/customers/${customerId}/orders?page=${page}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("RATE_LIMITED");
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }
}
