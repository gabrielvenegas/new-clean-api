export interface OlistApiResponse<T, K extends string> {
  retorno: {
    status_processamento: string;
    status: string;
    pagina: number;
    numero_paginas: number;
  } & Record<K, T[]>;
}
