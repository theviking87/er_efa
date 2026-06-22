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
      formador_disponibilidades: {
        Row: {
          created_at: string
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
