// Conteúdo da Ajuda dentro do sistema (central de ajuda + dicas "?" nas telas).
// Escrito para quem opera o dia a dia: o que é, como usar, e o que cuidar.

export type HelpSection = {
    id: string;
    title: string;
    audience: "admin" | "tech" | "both";
    where: string;          // onde fica no sistema
    summary: string;
    steps: string[];
    tips?: string[];
};

export const HELP_SECTIONS: HelpSection[] = [
    // ── Admin ────────────────────────────────────────────────────────────────
    {
        id: "planejamento",
        title: "Planejamento da rota (previsão de horários e dormidas)",
        audience: "admin",
        where: "Rotas → editar/criar rota → aba “Planejamento” na pré-visualização",
        summary: "Simula a rota dia a dia: horário previsto de cada OS, turno, deslocamento real, onde o técnico dorme e quando volta à base.",
        steps: [
            "Defina a saída e a chegada (CEP ou endereço) se forem diferentes da base. Eles ficam salvos na rota.",
            "Informe a hora de saída do 1º dia. Vazio usa o início do expediente.",
            "Em “Tempos de atendimento”, configure quantos minutos cada tipo de produto leva, o expediente, o almoço e até que horas ele pode dirigir. Também fica em Configurações.",
            "Em cada OS você pode digitar um tempo só dela (campo em minutos).",
            "“Usar previsão” grava a data e o turno previstos na OS; “Aplicar previsão em todas” faz isso na rota toda.",
            "“Sugerir melhor ordem” testa várias ordens e mostra o antes e depois (dias, turnos pedidos, estrada) antes de aplicar.",
        ],
        tips: [
            "Se a viagem até a próxima cidade passa do limite de direção, a previsão põe o técnico para dormir na estrada ou na cidade e continuar de manhã.",
            "Rota já em andamento considera sábado e domingo automaticamente.",
            "Se a data de chegada da rota for antes do fim previsto, aparece um aviso com botão para ajustar.",
        ],
    },
    {
        id: "ida-e-volta",
        title: "Rota de ida e volta no mesmo dia",
        audience: "admin",
        where: "Aba “Planejamento” → caixa “Rota de ida e volta no mesmo dia”",
        summary: "Para rotas em que o técnico sai da base e volta para ela todo dia, sem dormir fora.",
        steps: [
            "Marque a caixa. O sistema calcula os tempos entre a base e cada parada.",
            "Cada dia só leva as OS que permitem voltar à base até o limite de direção; as demais vão para o dia seguinte.",
            "Cada dia termina com “Volta à base: tempo — chega às HH:MM”. OS longe demais ficam marcadas como “não dá para ir e voltar no mesmo dia”.",
            "Nas abas Mapa e Lista + Mapa de qualquer rota (com ou sem ida e volta), o percurso aparece separado por dia, com uma cor para cada um, e dá para ver um dia por vez.",
            "Salve a rota para a escolha ficar gravada.",
        ],
    },
    {
        id: "ao-vivo",
        title: "Planejamento ao vivo e alerta de atraso",
        audience: "admin",
        where: "Rotas → ícone do olho (Visualizar) → aba “Planejamento”; selo “Atrasada” na lista",
        summary: "Acompanha a rota em andamento: o que já foi atendido (com a hora real) e o que falta, recalculado a cada minuto.",
        steps: [
            "As OS atendidas mostram a hora em que o técnico lançou a OS e quanto ficaram adiantadas ou atrasadas em relação à previsão original.",
            "O restante é recalculado a partir da última parada atendida e da hora de agora.",
            "Rotas atrasadas ganham o selo vermelho “Atrasada +1h05” e um aviso no topo da lista de Rotas.",
            "O limite para considerar atraso fica em Configurações → Tempos de Atendimento (padrão 40 min).",
        ],
        tips: ["Funciona com a tela aberta: o alerta não chega por mensagem."],
    },
    {
        id: "rota-entrega",
        title: "Rotas de Entrega (rota mãe e rotas filhas por dia)",
        audience: "admin",
        where: "Menu → Rotas de Entrega",
        summary: "Uma rota de controle para o envio de peças e OS. Dela saem rotas filhas por dia, só com as OS ainda não finalizadas.",
        steps: [
            "“Nova Rota de Entrega”: dê um nome e cole a planilha de OS. Ela não aparece para os técnicos.",
            "Na tabela, defina o Dia de cada OS (ou marque várias e use “Programar para este dia”). Dá para ordenar por qualquer coluna e combinar filtros (situação, garantia, cidade, bairro, turno).",
            "“Criar rotas dos dias” cria um rascunho por dia, já roteirizado. Abra em Rotas para definir técnico e motorista e publicar.",
            "Rastreio das peças: digitado na rota mãe ou na filha, ele aparece nas duas. “Sincronizar rastreios” põe tudo em dia de uma vez.",
            "“Salvar como padrão” guarda seus filtros, colunas e ordenação para as próximas vezes.",
        ],
        tips: [
            "OS já finalizadas aparecem em verde e não entram nas rotas filhas.",
            "Excluir a rota mãe não apaga as filhas: elas só perdem o vínculo.",
        ],
    },
    {
        id: "edicao-simultanea",
        title: "Várias pessoas editando a mesma rota",
        audience: "admin",
        where: "Rotas → editar rota",
        summary: "O sistema junta o que cada pessoa mexeu, sem apagar o trabalho do outro (nem o do técnico no celular).",
        steps: [
            "Um aviso amarelo mostra quem mais está com a rota aberta.",
            "A cada 20 segundos a tela busca mudanças de outras pessoas e as traz sem perder o que você digitou.",
            "Ao salvar, se alguém mexeu antes, o sistema mescla campo a campo. Se os dois mudaram o mesmo campo, vale o seu valor e você é avisado.",
            "No botão Salvar Rota, se houve mudança de outra pessoa, ela é trazida para a tela e você confere e salva de novo.",
        ],
    },
    {
        id: "historico",
        title: "Histórico de alterações da rota",
        audience: "admin",
        where: "Rotas → Visualizar → aba “Histórico”, ou botão “Histórico” ao editar",
        summary: "Mostra quem mudou o quê e quando, inclusive o que o técnico faz pelo celular.",
        steps: [
            "Cada linha traz o nome de quem alterou, a data e hora, e o antes e depois: técnico, datas, turno de uma OS, rastreio de peça, OS adicionada ou removida, ordem das paradas.",
            "Só admin e master veem. O histórico começa quando o recurso foi ativado no banco.",
        ],
    },
    {
        id: "bipagem",
        title: "Bipagem e rastreio de peças por várias pessoas",
        audience: "admin",
        where: "Conferência de Peças e Conferência Mobile",
        summary: "Mais de uma pessoa pode bipar a mesma rota ao mesmo tempo.",
        steps: [
            "Cada pessoa salva só o que bipou; o sistema não apaga o que outra pessoa já salvou.",
            "As telas buscam novidades a cada 8 a 10 segundos e mostram o que os outros biparam.",
            "O link da Conferência Mobile pode ser compartilhado com quem vai bipar.",
        ],
    },
    {
        id: "extrato-pecas",
        title: "Extrato de peças: “JÁ SAIU”",
        audience: "admin",
        where: "Conferência de Peças → Gerar Extrato PDF",
        summary: "Avisa quando a mesma peça já saiu para a mesma OS em outro dia, para não separar de novo.",
        steps: [
            "Vermelho: já saiu antes e não há uso registrado. Confira se já está separada.",
            "Âmbar: já saiu e foi usada na visita. Verifique o status dessa peça.",
            "A mesma etiqueta aparece na lista de rastreio, na tela.",
        ],
    },
    {
        id: "desconsiderar",
        title: "Desconsiderar um lançamento na rota",
        audience: "admin",
        where: "Ordens de Serviço → botão “Desconsiderar na rota”",
        summary: "Mantém o registro da OS, mas ela deixa de contar como atendida na rota.",
        steps: [
            "Clique em “Desconsiderar na rota” na linha da OS. Ela ganha a etiqueta “Fora da rota”.",
            "Some do progresso, do mapa, da previsão e do uso de peças. Continua nos relatórios e na produção do técnico.",
            "“Considerar na rota” desfaz.",
        ],
    },
    {
        id: "planejador-livre",
        title: "Planejador Livre: filtro OW/LP e saída/chegada",
        audience: "admin",
        where: "Rotas → Planejador Livre",
        summary: "Divide uma planilha em várias rotas por proximidade.",
        steps: [
            "Defina saída e chegada (opcionais) antes de dividir: valem para todas as rotas criadas.",
            "Na revisão, o filtro Garantia mostra só OW ou só LP, na lista e no mapa. Cada OS mostra o selo OW/LP e o TAT.",
            "Arraste paradas entre as rotas e use “Criar rascunho desta rota”.",
        ],
    },
    {
        id: "configuracoes",
        title: "Configurações que afetam o planejamento",
        audience: "admin",
        where: "Configurações",
        summary: "Tempos por produto, expediente, metas e a base da unidade.",
        steps: [
            "Tempos de Atendimento: minutos por tipo de produto, expediente, almoço, limite de direção, sábado/domingo e limite de atraso.",
            "Metas Mensais dos Técnicos: aparecem como barra de progresso em Minha Produção.",
            "Base da unidade: ponto de saída e retorno padrão das rotas.",
        ],
    },

    // ── Técnico ────────────────────────────────────────────────────────────────
    {
        id: "previsao",
        title: "Previsão da rota no celular",
        audience: "tech",
        where: "Rotas → botão “Previsão”",
        summary: "Mostra o horário estimado de cada atendimento, atualizado conforme você lança as OS.",
        steps: [
            "As OS já atendidas aparecem com a hora real do lançamento.",
            "As que faltam mostram o novo horário previsto, saindo da última parada atendida.",
            "A tela se atualiza sozinha a cada minuto.",
        ],
    },
    {
        id: "relatorio",
        title: "Salvar relatório e acompanhar o envio",
        audience: "tech",
        where: "Relatório e Meus Relatórios",
        summary: "O relatório é guardado no aparelho, o PDF baixa na hora e o envio acontece em segundo plano.",
        steps: [
            "Ao salvar, o PDF é baixado e o formulário fica livre para o próximo atendimento.",
            "O aviso no topo mostra o andamento do envio, ou o erro e o botão “Tentar agora”.",
            "Em Meus Relatórios você vê os pendentes e os enviados, e pode baixar o PDF de novo.",
            "Se o envio falhar, toque em “Diagnosticar”: ele testa o aparelho, a internet e o servidor e mostra onde está o problema.",
        ],
        tips: [
            "Se aparecer o aviso vermelho de que o relatório está só na memória, não feche nem atualize a página até ele ser enviado.",
            "O aviso diz se o problema é a sua internet ou o servidor do SmartOS.",
        ],
    },
    {
        id: "avisos",
        title: "Avisos no celular (notificações)",
        audience: "tech",
        where: "Sino no topo / convite “Receba aviso no celular”",
        summary: "Você é avisado quando uma rota nova chega ou a sua é alterada, mesmo com o app fechado.",
        steps: [
            "Toque em “Ativar” no convite, ou abra o sino e escolha “Receber avisos no aparelho”.",
            "Permita as notificações quando o navegador perguntar.",
            "No iPhone, o aviso com o app fechado só funciona com o app instalado na tela inicial.",
        ],
    },
    {
        id: "sem-sinal",
        title: "Trabalhando sem sinal",
        audience: "tech",
        where: "Em todo o app",
        summary: "Rotas, previsão e OS já carregadas continuam disponíveis sem internet.",
        steps: [
            "Abra as telas uma vez com internet: o aparelho guarda os dados por até 7 dias.",
            "Sem sinal aparece a faixa “Sem internet — mostrando os dados salvos às HH:MM”.",
            "Relatórios ficam guardados e são enviados sozinhos quando a conexão voltar.",
            "O mapa precisa de internet para as ruas; sem sinal só os pontos aparecem.",
        ],
    },
    {
        id: "producao",
        title: "Minha Produção",
        audience: "tech",
        where: "Menu → Minha Produção",
        summary: "Suas limpezas e orçamentos aprovados no mês, com posição no ranking, comparação com o mês anterior e metas.",
        steps: [
            "Troque o mês pelas setas.",
            "A barra de meta mostra quanto falta e o ritmo por dia para bater.",
        ],
    },
];

export const helpFor = (audience: "admin" | "tech") => HELP_SECTIONS.filter(s => s.audience === audience || s.audience === "both");
export const helpById = (id: string) => HELP_SECTIONS.find(s => s.id === id);
