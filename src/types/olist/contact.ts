import type { OlistApiResponse } from "./api-response";

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

export type CustomersResponse = OlistApiResponse<OlistCustomer, "contatos">;
