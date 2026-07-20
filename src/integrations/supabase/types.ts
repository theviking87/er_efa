export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      configuracao_financeira: {
        Row: {
          atualizacao: string
          created_at: string
          horas_mes: number
          id: string
          iva: number
          moeda: string
          updated_at: string
          valor_km: number
          valor_refeicao: number
        }
        Insert: {
          atualizacao?: string
          created_at?: string
          horas_mes?: number
          id?: string
          iva?: number
          moeda?: string
          updated_at?: string
          valor_km?: number
          valor_refeicao?: number
        }
        Update: {
          atualizacao?: string
          created_at?: string
          horas_mes?: number
          id?: string
          iva?: number
          moeda?: string
          updated_at?: string
          valor_km?: number
          valor_refeicao?: number
        }
        Relationships: []
      }
      cronograma_observacoes: {
        Row: {
          created_at: string
          curso_id: string
          id: string
          mes: string
          texto: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso_id: string
          id?: string
          mes: string
          texto?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso_id?: string
          id?: string
          mes?: string
          texto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_observacoes_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      curso_ferias: {
        Row: {
          created_at: string
          curso_id: string
          data_fim: string
          data_inicio: string
          id: string
          motivo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso_id: string
          data_fim: string
          data_inicio: string
          id?: string
          motivo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso_id?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          motivo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curso_ferias_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      curso_formando_ufcds: {
        Row: {
          created_at: string
          curso_formando_id: string
          curso_ufcd_id: string
          id: string
        }
        Insert: {
          created_at?: string
          curso_formando_id: string
          curso_ufcd_id: string
          id?: string
        }
        Update: {
          created_at?: string
          curso_formando_id?: string
          curso_ufcd_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curso_formando_ufcds_curso_formando_id_fkey"
            columns: ["curso_formando_id"]
            isOneToOne: false
            referencedRelation: "curso_formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curso_formando_ufcds_curso_ufcd_id_fkey"
            columns: ["curso_ufcd_id"]
            isOneToOne: false
            referencedRelation: "curso_ufcds"
            referencedColumns: ["id"]
          },
        ]
      }
      curso_formandos: {
        Row: {
          created_at: string
          curso_id: string
          data_inscricao: string
          estado: Database["public"]["Enums"]["inscricao_estado"]
          formando_id: string
          id: string
          observacoes: string | null
        }
        Insert: {
          created_at?: string
          curso_id: string
          data_inscricao?: string
          estado?: Database["public"]["Enums"]["inscricao_estado"]
          formando_id: string
          id?: string
          observacoes?: string | null
        }
        Update: {
          created_at?: string
          curso_id?: string
          data_inscricao?: string
          estado?: Database["public"]["Enums"]["inscricao_estado"]
          formando_id?: string
          id?: string
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curso_formandos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curso_formandos_formando_id_fkey"
            columns: ["formando_id"]
            isOneToOne: false
            referencedRelation: "formandos"
            referencedColumns: ["id"]
          },
        ]
      }
      curso_ufcd_formadores: {
        Row: {
          created_at: string
          curso_ufcd_id: string
          formador_id: string
          id: string
        }
        Insert: {
          created_at?: string
          curso_ufcd_id: string
          formador_id: string
          id?: string
        }
        Update: {
          created_at?: string
          curso_ufcd_id?: string
          formador_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curso_ufcd_formadores_curso_ufcd_id_fkey"
            columns: ["curso_ufcd_id"]
            isOneToOne: false
            referencedRelation: "curso_ufcds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curso_ufcd_formadores_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      curso_ufcds: {
        Row: {
          concluida: boolean
          created_at: string
          curso_id: string
          horas_totais: number
          id: string
          ordem: number
          ufcd_id: string
        }
        Insert: {
          concluida?: boolean
          created_at?: string
          curso_id: string
          horas_totais?: number
          id?: string
          ordem?: number
          ufcd_id: string
        }
        Update: {
          concluida?: boolean
          created_at?: string
          curso_id?: string
          horas_totais?: number
          id?: string
          ordem?: number
          ufcd_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curso_ufcds_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curso_ufcds_ufcd_id_fkey"
            columns: ["ufcd_id"]
            isOneToOne: false
            referencedRelation: "ufcds"
            referencedColumns: ["id"]
          },
        ]
      }
      cursos: {
        Row: {
          codigo: string
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          estado: Database["public"]["Enums"]["curso_estado"]
          id: string
          nome: string
          observacoes: string | null
          tipologia: Database["public"]["Enums"]["curso_tipologia"]
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          estado?: Database["public"]["Enums"]["curso_estado"]
          id?: string
          nome: string
          observacoes?: string | null
          tipologia?: Database["public"]["Enums"]["curso_tipologia"]
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          estado?: Database["public"]["Enums"]["curso_estado"]
          id?: string
          nome?: string
          observacoes?: string | null
          tipologia?: Database["public"]["Enums"]["curso_tipologia"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_auditoria: {
        Row: {
          campo_alterado: string | null
          data_hora: string
          entidade: string
          id: string
          motivo: string | null
          nome_utilizador: string
          operacao: string
          registo_id: string | null
          utilizador_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado?: string | null
          data_hora?: string
          entidade: string
          id?: string
          motivo?: string | null
          nome_utilizador: string
          operacao: string
          registo_id?: string | null
          utilizador_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string | null
          data_hora?: string
          entidade?: string
          id?: string
          motivo?: string | null
          nome_utilizador?: string
          operacao?: string
          registo_id?: string | null
          utilizador_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_auditoria_utilizador_id_fkey"
            columns: ["utilizador_id"]
            isOneToOne: false
            referencedRelation: "fin_utilizadores"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_configuracao_global: {
        Row: {
          ativo: boolean
          casas_decimais: number
          created_at: string
          data_inicio: string
          horas_mes_referencia: number
          id: string
          moeda: string
          observacoes: string | null
          updated_at: string
          utilizador_id: string | null
          utilizador_nome: string | null
          valor_km: number
          valor_subsidio_alimentacao: number
        }
        Insert: {
          ativo?: boolean
          casas_decimais?: number
          created_at?: string
          data_inicio?: string
          horas_mes_referencia?: number
          id?: string
          moeda?: string
          observacoes?: string | null
          updated_at?: string
          utilizador_id?: string | null
          utilizador_nome?: string | null
          valor_km?: number
          valor_subsidio_alimentacao?: number
        }
        Update: {
          ativo?: boolean
          casas_decimais?: number
          created_at?: string
          data_inicio?: string
          horas_mes_referencia?: number
          id?: string
          moeda?: string
          observacoes?: string | null
          updated_at?: string
          utilizador_id?: string | null
          utilizador_nome?: string | null
          valor_km?: number
          valor_subsidio_alimentacao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_configuracao_global_utilizador_id_fkey"
            columns: ["utilizador_id"]
            isOneToOne: false
            referencedRelation: "fin_utilizadores"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_formador_config: {
        Row: {
          artigo_isencao: string | null
          created_at: string
          formador_id: string
          iban: string | null
          id: string
          observacoes: string | null
          percentagem_irs: number
          percentagem_ss: number | null
          regime_iva: string
          retencao_irs: boolean
          seguranca_social: boolean
          updated_at: string
        }
        Insert: {
          artigo_isencao?: string | null
          created_at?: string
          formador_id: string
          iban?: string | null
          id?: string
          observacoes?: string | null
          percentagem_irs?: number
          percentagem_ss?: number | null
          regime_iva?: string
          retencao_irs?: boolean
          seguranca_social?: boolean
          updated_at?: string
        }
        Update: {
          artigo_isencao?: string | null
          created_at?: string
          formador_id?: string
          iban?: string | null
          id?: string
          observacoes?: string | null
          percentagem_irs?: number
          percentagem_ss?: number | null
          regime_iva?: string
          retencao_irs?: boolean
          seguranca_social?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_formador_config_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: true
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_formando_rubricas: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          elegivel: boolean
          formando_id: string
          iban: string | null
          id: string
          limite_especifico: number | null
          observacoes: string | null
          rubrica_id: string
          updated_at: string
          valor_especifico: number | null
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          elegivel?: boolean
          formando_id: string
          iban?: string | null
          id?: string
          limite_especifico?: number | null
          observacoes?: string | null
          rubrica_id: string
          updated_at?: string
          valor_especifico?: number | null
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          elegivel?: boolean
          formando_id?: string
          iban?: string | null
          id?: string
          limite_especifico?: number | null
          observacoes?: string | null
          rubrica_id?: string
          updated_at?: string
          valor_especifico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_formando_rubricas_formando_id_fkey"
            columns: ["formando_id"]
            isOneToOne: false
            referencedRelation: "formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_formando_rubricas_rubrica_id_fkey"
            columns: ["rubrica_id"]
            isOneToOne: false
            referencedRelation: "fin_rubricas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_rubrica_regras: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string
          dias_minimos: number | null
          horas_referencia: number | null
          id: string
          observacoes: string | null
          permite_edicao_manual: boolean
          permite_limite: boolean
          rubrica_id: string
          updated_at: string
          valor_maximo: number | null
          valor_unitario: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dias_minimos?: number | null
          horas_referencia?: number | null
          id?: string
          observacoes?: string | null
          permite_edicao_manual?: boolean
          permite_limite?: boolean
          rubrica_id: string
          updated_at?: string
          valor_maximo?: number | null
          valor_unitario?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dias_minimos?: number | null
          horas_referencia?: number | null
          id?: string
          observacoes?: string | null
          permite_edicao_manual?: boolean
          permite_limite?: boolean
          rubrica_id?: string
          updated_at?: string
          valor_maximo?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_rubrica_regras_rubrica_id_fkey"
            columns: ["rubrica_id"]
            isOneToOne: false
            referencedRelation: "fin_rubricas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_rubricas: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          descricao: string
          gera_documento: boolean
          gera_exportacao: boolean
          id: string
          observacoes: string | null
          ordem: number
          permite_edicao_manual: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          descricao: string
          gera_documento?: boolean
          gera_exportacao?: boolean
          id?: string
          observacoes?: string | null
          ordem?: number
          permite_edicao_manual?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          descricao?: string
          gera_documento?: boolean
          gera_exportacao?: boolean
          id?: string
          observacoes?: string | null
          ordem?: number
          permite_edicao_manual?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      fin_utilizadores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          nome_utilizador: string
          observacoes: string | null
          perfil: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          nome_utilizador: string
          observacoes?: string | null
          perfil?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          nome_utilizador?: string
          observacoes?: string | null
          perfil?: string
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_bolsas: {
        Row: {
          created_at: string
          editado_manual: boolean
          formando_id: string
          horas_frequentadas: number
          horas_previstas: number
          id: string
          observacoes: string | null
          processamento_id: string
          updated_at: string
          valor_calculado: number
          valor_final: number
          valor_hora: number
        }
        Insert: {
          created_at?: string
          editado_manual?: boolean
          formando_id: string
          horas_frequentadas?: number
          horas_previstas?: number
          id?: string
          observacoes?: string | null
          processamento_id: string
          updated_at?: string
          valor_calculado?: number
          valor_final?: number
          valor_hora?: number
        }
        Update: {
          created_at?: string
          editado_manual?: boolean
          formando_id?: string
          horas_frequentadas?: number
          horas_previstas?: number
          id?: string
          observacoes?: string | null
          processamento_id?: string
          updated_at?: string
          valor_calculado?: number
          valor_final?: number
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_bolsas_formando_id_fkey"
            columns: ["formando_id"]
            isOneToOne: false
            referencedRelation: "formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_bolsas_processamento_id_fkey"
            columns: ["processamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_processamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_honorarios: {
        Row: {
          created_at: string
          descricao: string | null
          formador_id: string | null
          id: string
          iva: number
          processamento_id: string
          total: number
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          formador_id?: string | null
          id?: string
          iva?: number
          processamento_id: string
          total?: number
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          descricao?: string | null
          formador_id?: string | null
          id?: string
          iva?: number
          processamento_id?: string
          total?: number
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_honorarios_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_honorarios_processamento_id_fkey"
            columns: ["processamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_processamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_processamentos: {
        Row: {
          ano: number
          created_at: string
          curso_id: string
          data_criacao: string
          data_fecho: string | null
          estado: string
          id: string
          mes: number
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          curso_id: string
          data_criacao?: string
          data_fecho?: string | null
          estado?: string
          id?: string
          mes: number
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          curso_id?: string
          data_criacao?: string
          data_fecho?: string | null
          estado?: string
          id?: string
          mes?: number
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_processamentos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_quilometros: {
        Row: {
          created_at: string
          data: string
          destino: string | null
          formando_id: string
          id: string
          km: number
          origem: string | null
          processamento_id: string
          total: number
          updated_at: string
          valor_km: number
        }
        Insert: {
          created_at?: string
          data: string
          destino?: string | null
          formando_id: string
          id?: string
          km?: number
          origem?: string | null
          processamento_id: string
          total?: number
          updated_at?: string
          valor_km?: number
        }
        Update: {
          created_at?: string
          data?: string
          destino?: string | null
          formando_id?: string
          id?: string
          km?: number
          origem?: string | null
          processamento_id?: string
          total?: number
          updated_at?: string
          valor_km?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_quilometros_formando_id_fkey"
            columns: ["formando_id"]
            isOneToOne: false
            referencedRelation: "formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_quilometros_processamento_id_fkey"
            columns: ["processamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_processamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_subsidios: {
        Row: {
          created_at: string
          dias: number
          formando_id: string
          id: string
          processamento_id: string
          total: number
          updated_at: string
          valor_dia: number
        }
        Insert: {
          created_at?: string
          dias?: number
          formando_id: string
          id?: string
          processamento_id: string
          total?: number
          updated_at?: string
          valor_dia?: number
        }
        Update: {
          created_at?: string
          dias?: number
          formando_id?: string
          id?: string
          processamento_id?: string
          total?: number
          updated_at?: string
          valor_dia?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_subsidios_formando_id_fkey"
            columns: ["formando_id"]
            isOneToOne: false
            referencedRelation: "formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_subsidios_processamento_id_fkey"
            columns: ["processamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_processamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      formador_disponibilidades: {
        Row: {
          created_at: string
          curso_id: string | null
          data: string
          formador_id: string
          hora_fim: string
          hora_inicio: string
          id: string
          notas: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso_id?: string | null
          data: string
          formador_id: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso_id?: string | null
          data?: string
          formador_id?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formador_disponibilidades_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formador_disponibilidades_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      formador_documentos: {
        Row: {
          created_at: string
          formador_id: string
          id: string
          nome: string
          storage_path: string
          tipo: string
          validade: string | null
        }
        Insert: {
          created_at?: string
          formador_id: string
          id?: string
          nome: string
          storage_path: string
          tipo: string
          validade?: string | null
        }
        Update: {
          created_at?: string
          formador_id?: string
          id?: string
          nome?: string
          storage_path?: string
          tipo?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formador_documentos_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      formador_inatividades: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          formador_id: string
          id: string
          motivo: string | null
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          formador_id: string
          id?: string
          motivo?: string | null
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          formador_id?: string
          id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formador_inatividades_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      formador_ufcds: {
        Row: {
          created_at: string
          formador_id: string
          id: string
          ufcd_id: string
        }
        Insert: {
          created_at?: string
          formador_id: string
          id?: string
          ufcd_id: string
        }
        Update: {
          created_at?: string
          formador_id?: string
          id?: string
          ufcd_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formador_ufcds_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formador_ufcds_ufcd_id_fkey"
            columns: ["ufcd_id"]
            isOneToOne: false
            referencedRelation: "ufcds"
            referencedColumns: ["id"]
          },
        ]
      }
      formadores: {
        Row: {
          abreviatura: string | null
          cc: string | null
          ccp: string | null
          codigo_postal: string | null
          cor: string
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: Database["public"]["Enums"]["formador_estado"]
          habilitacoes: string | null
          iban: string | null
          id: string
          localidade: string | null
          morada: string | null
          nif: string | null
          nome: string
          observacoes: string | null
          telemovel: string | null
          updated_at: string
          validade_cc: string | null
          validade_ccp: string | null
        }
        Insert: {
          abreviatura?: string | null
          cc?: string | null
          ccp?: string | null
          codigo_postal?: string | null
          cor?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["formador_estado"]
          habilitacoes?: string | null
          iban?: string | null
          id?: string
          localidade?: string | null
          morada?: string | null
          nif?: string | null
          nome: string
          observacoes?: string | null
          telemovel?: string | null
          updated_at?: string
          validade_cc?: string | null
          validade_ccp?: string | null
        }
        Update: {
          abreviatura?: string | null
          cc?: string | null
          ccp?: string | null
          codigo_postal?: string | null
          cor?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["formador_estado"]
          habilitacoes?: string | null
          iban?: string | null
          id?: string
          localidade?: string | null
          morada?: string | null
          nif?: string | null
          nome?: string
          observacoes?: string | null
          telemovel?: string | null
          updated_at?: string
          validade_cc?: string | null
          validade_ccp?: string | null
        }
        Relationships: []
      }
      formando_faltas: {
        Row: {
          created_at: string
          curso_formando_id: string
          data: string
          horas: number
          id: string
          observacoes: string | null
          sessao_id: string | null
          tipo: Database["public"]["Enums"]["falta_tipo"]
        }
        Insert: {
          created_at?: string
          curso_formando_id: string
          data: string
          horas?: number
          id?: string
          observacoes?: string | null
          sessao_id?: string | null
          tipo?: Database["public"]["Enums"]["falta_tipo"]
        }
        Update: {
          created_at?: string
          curso_formando_id?: string
          data?: string
          horas?: number
          id?: string
          observacoes?: string | null
          sessao_id?: string | null
          tipo?: Database["public"]["Enums"]["falta_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "formando_faltas_curso_formando_id_fkey"
            columns: ["curso_formando_id"]
            isOneToOne: false
            referencedRelation: "curso_formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formando_faltas_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      formando_pra: {
        Row: {
          created_at: string
          curso_formando_id: string
          curso_ufcd_id: string
          id: string
          nome: string | null
          nota: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso_formando_id: string
          curso_ufcd_id: string
          id?: string
          nome?: string | null
          nota?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso_formando_id?: string
          curso_ufcd_id?: string
          id?: string
          nome?: string | null
          nota?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formando_pra_curso_formando_id_fkey"
            columns: ["curso_formando_id"]
            isOneToOne: false
            referencedRelation: "curso_formandos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formando_pra_curso_ufcd_id_fkey"
            columns: ["curso_ufcd_id"]
            isOneToOne: false
            referencedRelation: "curso_ufcds"
            referencedColumns: ["id"]
          },
        ]
      }
      formandos: {
        Row: {
          cc: string | null
          codigo_postal: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: Database["public"]["Enums"]["formando_estado"]
          habilitacoes: string | null
          id: string
          localidade: string | null
          morada: string | null
          nif: string | null
          niss: string | null
          nome: string
          observacoes: string | null
          situacao_emprego: string | null
          telemovel: string | null
          updated_at: string
          validade_cc: string | null
        }
        Insert: {
          cc?: string | null
          codigo_postal?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["formando_estado"]
          habilitacoes?: string | null
          id?: string
          localidade?: string | null
          morada?: string | null
          nif?: string | null
          niss?: string | null
          nome: string
          observacoes?: string | null
          situacao_emprego?: string | null
          telemovel?: string | null
          updated_at?: string
          validade_cc?: string | null
        }
        Update: {
          cc?: string | null
          codigo_postal?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["formando_estado"]
          habilitacoes?: string | null
          id?: string
          localidade?: string | null
          morada?: string | null
          nif?: string | null
          niss?: string | null
          nome?: string
          observacoes?: string | null
          situacao_emprego?: string | null
          telemovel?: string | null
          updated_at?: string
          validade_cc?: string | null
        }
        Relationships: []
      }
      sessoes: {
        Row: {
          created_at: string
          curso_id: string
          curso_ufcd_id: string
          data: string
          formador_id: string
          hora_fim: string
          hora_inicio: string
          horas: number
          id: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso_id: string
          curso_ufcd_id: string
          data: string
          formador_id: string
          hora_fim: string
          hora_inicio: string
          horas: number
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso_id?: string
          curso_ufcd_id?: string
          data?: string
          formador_id?: string
          hora_fim?: string
          hora_inicio?: string
          horas?: number
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_curso_ufcd_id_fkey"
            columns: ["curso_ufcd_id"]
            isOneToOne: false
            referencedRelation: "curso_ufcds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_formador_id_fkey"
            columns: ["formador_id"]
            isOneToOne: false
            referencedRelation: "formadores"
            referencedColumns: ["id"]
          },
        ]
      }
      ufcds: {
        Row: {
          codigo: string
          created_at: string
          designacao: string
          horas_referencia: number
          id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          designacao: string
          horas_referencia?: number
          id?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          designacao?: string
          horas_referencia?: number
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      curso_estado:
        | "planeado"
        | "ativo"
        | "concluido"
        | "suspenso"
        | "cancelado"
      curso_tipologia: "EFA" | "ERFA" | "MFA" | "OUTRO"
      falta_tipo: "justificada" | "injustificada"
      formador_estado:
        | "ativo"
        | "inativo"
        | "ferias"
        | "baixa_medica"
        | "suspenso"
        | "arquivado"
      formando_estado: "ativo" | "inativo" | "desistente" | "concluido"
      inscricao_estado: "inscrito" | "em_formacao" | "concluido" | "desistente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      curso_estado: ["planeado", "ativo", "concluido", "suspenso", "cancelado"],
      curso_tipologia: ["EFA", "ERFA", "MFA", "OUTRO"],
      falta_tipo: ["justificada", "injustificada"],
      formador_estado: [
        "ativo",
        "inativo",
        "ferias",
        "baixa_medica",
        "suspenso",
        "arquivado",
      ],
      formando_estado: ["ativo", "inativo", "desistente", "concluido"],
      inscricao_estado: ["inscrito", "em_formacao", "concluido", "desistente"],
    },
  },
} as const
