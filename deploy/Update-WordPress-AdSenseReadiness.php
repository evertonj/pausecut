<?php
/**
 * Idempotent content update for HomeForgeLab.
 * Run with: wp eval-file Update-WordPress-AdSenseReadiness.php
 */

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Execute este arquivo pelo WP-CLI.\n");
    exit(1);
}

$contactEmail = 'contato@homeforgelab.com';
$githubUrl = 'https://github.com/evertonj';
$pauseCutUrl = 'https://pausecut.homeforgelab.com/';
$devToolsUrl = 'https://dev.homeforgelab.com/';

function hfl_update_post_content($postId, $content) {
    $result = wp_update_post([
        'ID' => $postId,
        'post_content' => $content,
    ], true);
    if (is_wp_error($result)) {
        throw new RuntimeException($result->get_error_message());
    }
}

// Keep the original contact form and social links, adding direct public channels.
$contact = get_post(23);
if ($contact && strpos($contact->post_content, 'HFL_PUBLIC_CONTACTS') === false) {
    $publicContacts = <<<HTML
  <!-- HFL_PUBLIC_CONTACTS -->
  <div style="background:#fff7f0;border:1.5px solid #ffd8b8;border-radius:12px;padding:20px;margin:0 0 26px;box-sizing:border-box">
    <strong style="display:block;color:#111;margin-bottom:8px">Contato direto e projetos</strong>
    <p style="margin:0 0 7px;line-height:1.6"><a href="mailto:{$contactEmail}">{$contactEmail}</a></p>
    <p style="margin:0;line-height:1.6"><a href="{$githubUrl}" target="_blank" rel="me noopener noreferrer">GitHub · @evertonj</a></p>
  </div>

HTML;
    $content = str_replace('  <!-- BOTÕES -->', $publicContacts . '  <!-- BOTÕES -->', $contact->post_content);
    hfl_update_post_content(23, $content);
    echo "Contato atualizado.\n";
}

// Add the public GitHub profile to the existing About page without replacing its text.
$about = get_post(174);
if ($about && strpos($about->post_content, $githubUrl) === false) {
    $githubBlock = <<<HTML

<!-- wp:heading -->
<h2>Projetos e código</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Algumas ferramentas criadas para o fluxo de produção do HomeForge Lab são publicadas com documentação e código no <a href="{$githubUrl}" rel="me">GitHub de Everton Spindola</a>. Entre elas está o <a href="{$pauseCutUrl}">PauseCut</a>, usado para preparar vídeos localmente antes da edição.</p>
<!-- /wp:paragraph -->
HTML;
    hfl_update_post_content(174, $about->post_content . $githubBlock);
    echo "Página Sobre atualizada.\n";
}

$toolsContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Ferramentas criadas para resolver tarefas reais do HomeForge Lab, com documentação clara, privacidade e acesso direto.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>PauseCut — pré-edição de vídeo no seu dispositivo</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O PauseCut identifica intervalos de baixo volume, permite revisar os cortes e exporta um novo MP4. Também converte proporções para 9:16, 1:1, 4:5 e 16:9, oferece opções de enquadramento e pode limitar aproximadamente o tamanho do arquivo.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>O vídeo selecionado não é enviado ao servidor: na versão web, o processamento acontece no navegador com WebAssembly. Para trabalhos maiores, a versão desktop para Windows usa o FFmpeg nativo e detecta aceleração compatível com NVIDIA, Intel e AMD, recorrendo à CPU quando necessário.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$pauseCutUrl}">Abrir o PauseCut</a></div>
<!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="{$pauseCutUrl}#download-desktop">Baixar para Windows</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:heading -->
<h2>HomeForge Dev Tools — ferramentas de software</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O HomeForge Dev Tools reúne utilitários para desenvolvimento que funcionam diretamente no navegador. Os dados digitados são processados localmente e não são enviados ao servidor da ferramenta. O portal inclui recursos para JSON, expressões regulares, Base64, URL encoding, Unix Timestamp, GUID, senhas e hashes.</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><li><a href="{$devToolsUrl}ferramentas/formatador-json/">Formatador e validador de JSON</a></li><li><a href="{$devToolsUrl}ferramentas/testador-regex/">Testador de expressões regulares</a></li><li><a href="{$devToolsUrl}conversores/base64/">Codificador e decodificador Base64</a></li><li><a href="{$devToolsUrl}conversores/url-encode-decode/">URL encode/decode</a></li><li><a href="{$devToolsUrl}conversores/unix-timestamp/">Conversor Unix Timestamp</a></li><li><a href="{$devToolsUrl}geradores/guid/">Gerador de GUID</a></li><li><a href="{$devToolsUrl}geradores/senha/">Gerador de senha</a></li><li><a href="{$devToolsUrl}geradores/hash/">Gerador de hash</a></li></ul>
<!-- /wp:list -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}">Abrir o HomeForge Dev Tools</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:heading -->
<h2>Documentação e código</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O projeto tem guias públicos sobre ajuste de silêncio, exportação, formatos verticais e tratamento de áudio. O código e o histórico de desenvolvimento ficam no <a href="{$githubUrl}" rel="me">GitHub @evertonj</a>. Dúvidas e correções podem ser enviadas para <a href="mailto:{$contactEmail}">{$contactEmail}</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Transparência</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O PauseCut é uma ferramenta independente do HomeForge Lab e não tem afiliação com CapCut, Google ou Hostinger. A detecção é baseada em volume, por isso o resultado deve ser revisado antes da publicação. O arquivo original deve ser mantido como cópia de segurança.</p>
<!-- /wp:paragraph -->
HTML;

$toolsPage = get_page_by_path('ferramentas-homeforge', OBJECT, 'page');
$toolsData = [
    'post_title' => 'Ferramentas de Software do HomeForge Lab',
    'post_name' => 'ferramentas-homeforge',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => $toolsContent,
    'post_excerpt' => 'Ferramentas de software criadas pelo HomeForge Lab: PauseCut e utilitários locais para desenvolvimento.',
];
if ($toolsPage) {
    $toolsData['ID'] = $toolsPage->ID;
    $toolsId = wp_update_post($toolsData, true);
} else {
    $toolsId = wp_insert_post($toolsData, true);
}
if (is_wp_error($toolsId)) {
    throw new RuntimeException($toolsId->get_error_message());
}
echo "Página Ferramentas pronta: {$toolsId}.\n";

$articleContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Editar um vídeo longo costuma começar com uma tarefa repetitiva: localizar silêncios, cortar cada intervalo e conferir se nenhuma palavra foi atingida. O PauseCut nasceu para automatizar essa pré-edição sem enviar a gravação para outro servidor.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>O problema que queríamos resolver</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Nos vídeos do HomeForge Lab, a gravação de um projeto inclui esperas naturais: procurar uma ferramenta, reposicionar a câmera, conferir uma medida ou simplesmente organizar a próxima explicação. Alguns desses intervalos são úteis para o público; outros apenas aumentam o trabalho na linha do tempo.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>A proposta não é decidir o ritmo final do vídeo. A ferramenta encontra regiões de baixo volume, preserva margens junto à fala e apresenta os intervalos para revisão. Música, ruído constante e vozes muito baixas alteram a detecção, por isso o resultado continua dependendo de uma conferência humana.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Processamento local e privacidade</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Na versão web, o navegador baixa o motor de vídeo e abre o MP4 diretamente no dispositivo. O arquivo, o áudio, o nome da gravação e o relatório de cortes não são enviados para a hospedagem do PauseCut. A sessão termina quando a aba é fechada ou recarregada, então o resultado precisa ser baixado antes disso.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Esse modelo evita uma fila de uploads e mantém gravações pessoais no computador, mas também transfere o custo de processamento para o navegador. Arquivos longos, alta resolução e muitos cortes podem exigir bastante memória. O modo web oferece uma opção equilibrada de até 720p justamente para diminuir essa carga.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Por que também existe uma versão desktop</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O navegador é conveniente, mas tem limites de memória e acesso ao hardware. A versão desktop para Windows executa o FFmpeg nativo de 64 bits, detecta NVIDIA NVENC, Intel Quick Sync e AMD AMF e, quando nenhuma aceleração compatível está disponível, usa a CPU nativa com os processadores lógicos detectados.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>O pacote é autocontido: não exige uma instalação separada do .NET ou do FFmpeg. Depois de baixar e extrair o ZIP, basta abrir o executável. Os vídeos e temporários continuam no computador do usuário.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Além de remover pausas</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li>Conversão para 9:16, 1:1, 4:5 e 16:9.</li><li>Recorte com foco manual, fundo desfocado ou bordas.</li><li>Compressão por limite aproximado de tamanho.</li><li>Normalização de volume e tratamento leve voltado para voz.</li><li>Relatório JSON com os parâmetros e intervalos detectados.</li></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>O MP4 exportado usa vídeo H.264 e áudio AAC, formatos comuns para continuar a edição em CapCut, DaVinci Resolve, Premiere ou outro programa. O relatório não é um projeto de edição e não substitui o vídeo original.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Como usar com segurança</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Comece com um trecho curto e use o preset equilibrado. Depois da análise, ouça o início e o fim de alguns cortes. Se sílabas desaparecerem, aumente a margem ou use um limite de silêncio mais conservador. Se o ritmo ficar acelerado, preserve pausas maiores. Só processe a gravação completa quando o ajuste estiver natural.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Mantenha o MP4 original, baixe o resultado com outro nome e faça uma revisão antes de criar legendas. Como a linha do tempo fica menor, legendas e marcadores preparados sobre o arquivo original não acompanham automaticamente os novos tempos.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$pauseCutUrl}">Usar o PauseCut no navegador</a></div>
<!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="{$pauseCutUrl}#download-desktop">Baixar a versão desktop</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:heading -->
<h2>Projeto aberto e contato</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O código, a documentação técnica e o histórico do projeto estão no <a href="{$githubUrl}" rel="me">GitHub @evertonj</a>. Para relatar um problema sem expor uma gravação pessoal, informe o navegador ou versão do Windows, o tamanho aproximado do arquivo, os parâmetros usados e a mensagem apresentada. O contato público é <a href="mailto:{$contactEmail}">{$contactEmail}</a>.</p>
<!-- /wp:paragraph -->
HTML;

$article = get_page_by_path('pausecut-editor-video-local', OBJECT, 'post');
$category = get_term_by('slug', 'projetos-e-tecnologia', 'category');
if (!$category) {
    $createdCategory = wp_insert_term('Projetos e tecnologia', 'category', ['slug' => 'projetos-e-tecnologia']);
    if (is_wp_error($createdCategory)) {
        throw new RuntimeException($createdCategory->get_error_message());
    }
    $categoryId = (int)$createdCategory['term_id'];
} else {
    $categoryId = (int)$category->term_id;
}
$articleData = [
    'post_title' => 'PauseCut: editor gratuito para remover pausas e preparar vídeos localmente',
    'post_name' => 'pausecut-editor-video-local',
    'post_status' => 'publish',
    'post_type' => 'post',
    'post_content' => $articleContent,
    'post_excerpt' => 'Conheça o PauseCut, ferramenta do HomeForge Lab que remove pausas, converte formatos e prepara vídeos no navegador ou no Windows sem enviar o MP4 para o servidor.',
    'post_category' => [$categoryId],
];
if ($article) {
    $articleData['ID'] = $article->ID;
    $articleId = wp_update_post($articleData, true);
} else {
    $articleId = wp_insert_post($articleData, true);
}
if (is_wp_error($articleId)) {
    throw new RuntimeException($articleId->get_error_message());
}
echo "Artigo do PauseCut pronto: {$articleId}.\n";

$softwareCategory = get_term_by('slug', 'software-e-desenvolvimento', 'category');
if (!$softwareCategory) {
    $createdSoftwareCategory = wp_insert_term('Software e desenvolvimento', 'category', ['slug' => 'software-e-desenvolvimento']);
    if (is_wp_error($createdSoftwareCategory)) {
        throw new RuntimeException($createdSoftwareCategory->get_error_message());
    }
    $softwareCategoryId = (int)$createdSoftwareCategory['term_id'];
} else {
    $softwareCategoryId = (int)$softwareCategory->term_id;
}

$devOverviewContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Formatar um JSON, converter uma data de log ou gerar um identificador não deveria exigir instalar um programa nem enviar dados de trabalho para um serviço desconhecido. O HomeForge Dev Tools reúne oito utilitários que executam essas tarefas localmente no navegador.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>O que significa processamento local</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>As páginas, o JavaScript e os estilos são entregues pela hospedagem, mas o conteúdo digitado nos campos é processado pelo próprio navegador. Isso é especialmente útil ao trabalhar com respostas de APIs, trechos de logs, identificadores e textos que não precisam sair do computador apenas para uma conversão rápida.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Processamento local não elimina todas as responsabilidades de segurança. Ainda é importante revisar o que será colado, evitar segredos de produção quando não houver necessidade e manter navegador e sistema atualizados. A vantagem é que a implementação das ferramentas não envia o texto informado para uma API de processamento.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Validação e inspeção</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O <a href="{$devToolsUrl}ferramentas/formatador-json/">formatador e validador de JSON</a> usa o parser do navegador para verificar a sintaxe, indentar com dois ou quatro espaços e minificar. Ele aceita objetos e arrays, preserva Unicode e limita a entrada a 500 mil caracteres para reduzir o risco de travamento.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>O <a href="{$devToolsUrl}ferramentas/testador-regex/">testador de expressões regulares</a> usa a sintaxe JavaScript e mostra correspondências e grupos. A execução ocorre em segundo plano, com limite de tempo, tamanho e quantidade de resultados para conter expressões problemáticas. Isso ajuda a experimentar uma regra antes de incorporá-la ao código, lembrando que PCRE, Python e .NET têm diferenças de sintaxe e comportamento.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Conversores para APIs e logs</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O conjunto de conversores inclui <a href="{$devToolsUrl}conversores/base64/">Base64 com UTF-8 e opção URL-safe</a>, <a href="{$devToolsUrl}conversores/url-encode-decode/">percent-encoding para parâmetros ou URLs completas</a> e <a href="{$devToolsUrl}conversores/unix-timestamp/">Unix Timestamp em segundos ou milissegundos</a>. Eles ajudam a inspecionar dados de integração sem misturar conceitos: Base64 representa bytes, URL encoding protege a estrutura de uma URL e Unix Timestamp representa um instante relativo à Epoch.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Geradores e integridade</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O portal também oferece um <a href="{$devToolsUrl}geradores/guid/">gerador de UUID v4</a>, um <a href="{$devToolsUrl}geradores/senha/">gerador de senhas aleatórias</a> e um <a href="{$devToolsUrl}geradores/hash/">calculador SHA</a>. Cada ferramenta explica limites importantes: GUID não é segredo, Base64 não é criptografia, SHA simples não é adequado para guardar senhas e uma senha gerada deve ser salva em um gerenciador confiável.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>As oito ferramentas disponíveis</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li>Formatador e validador de JSON.</li><li>Testador de Regex JavaScript.</li><li>Codificador e decodificador Base64.</li><li>URL encode/decode.</li><li>Conversor Unix Timestamp.</li><li>Gerador de GUID/UUID v4.</li><li>Gerador de senha.</li><li>Gerador de hash SHA.</li></ul>
<!-- /wp:list -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}">Abrir o HomeForge Dev Tools</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
HTML;

$jsonRegexContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">JSON e expressões regulares aparecem o tempo todo em APIs, configurações, logs e validações. As duas ferramentas ajudam a enxergar erros rapidamente, mas cada uma tem limites que precisam ser entendidos antes de levar o resultado para produção.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Validar antes de formatar</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Um JSON válido segue regras rígidas: nomes de propriedades e textos usam aspas duplas, não há vírgula depois do último item e comentários não fazem parte do padrão. O <a href="{$devToolsUrl}ferramentas/formatador-json/">formatador de JSON do HomeForge Dev Tools</a> usa <code>JSON.parse</code> para validar. Se o conteúdo for aceito, <code>JSON.stringify</code> gera a versão indentada ou minificada.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Formatar com dois ou quatro espaços melhora a leitura humana e ajuda a localizar objetos aninhados. Minificar remove espaços dispensáveis para transporte ou comparação. Nenhuma das opções muda o significado dos valores, mas a serialização pode normalizar detalhes de apresentação. Por isso, mantenha o original quando estiver investigando exatamente o que um sistema recebeu.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Erros comuns em payloads JSON</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li>Vírgula sobrando antes de fechar um objeto ou array.</li><li>Aspas simples no lugar de aspas duplas.</li><li>Quebra de linha não escapada dentro de um texto.</li><li>Valor <code>undefined</code>, que não faz parte do JSON.</li><li>Chaves ou colchetes abertos sem o fechamento correspondente.</li></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>A indicação de linha e coluna depende da mensagem produzida pelo navegador e pode ser aproximada. A ferramenta não executa o conteúdo colado. O limite de 500 mil caracteres existe para manter a página responsiva; arquivos maiores devem ser tratados por ferramentas de linha de comando ou pelo ambiente de desenvolvimento.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Testando uma expressão regular</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>No <a href="{$devToolsUrl}ferramentas/testador-regex/">testador de Regex</a>, a expressão é informada sem as barras externas e as flags são escolhidas separadamente. A flag <code>g</code> procura todas as correspondências, <code>i</code> ignora diferença entre maiúsculas e minúsculas, <code>m</code> altera o comportamento de início e fim em várias linhas, <code>s</code> permite que o ponto inclua quebras de linha, <code>u</code> ativa o tratamento Unicode e <code>y</code> usa a busca sticky.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Grupos comuns e grupos nomeados ajudam a separar partes do texto. Em JavaScript, um grupo nomeado usa a forma <code>(?&lt;nome&gt;...)</code>. Esse detalhe não deve ser copiado sem revisão para outro mecanismo: uma expressão válida no navegador pode precisar de mudanças em .NET, Python, Java, banco de dados ou ferramentas baseadas em PCRE.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Proteção contra expressões pesadas</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Algumas combinações com repetições aninhadas podem consumir muito tempo em determinados textos. A ferramenta executa o teste em segundo plano e interrompe operações acima de dois segundos. Também limita o padrão a mil caracteres, o texto a 50 mil e a visualização a 500 correspondências. Esses limites ajudam durante a experimentação, mas não provam que a expressão terá desempenho seguro com toda entrada possível em um servidor.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Um fluxo simples de depuração</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>Reduza o JSON ou texto a um exemplo mínimo que ainda reproduza o problema.</li><li>Valide a estrutura antes de criar uma Regex para procurar valores dentro dela.</li><li>Teste casos que devem corresponder e casos que devem falhar.</li><li>Confira grupos, flags e diferenças do mecanismo usado no projeto.</li><li>Leve a regra para testes automatizados antes de publicar.</li></ol>
<!-- /wp:list -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}ferramentas/formatador-json/">Formatar JSON</a></div><!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}ferramentas/testador-regex/">Testar Regex</a></div><!-- /wp:button --></div>
<!-- /wp:buttons -->
HTML;

$convertersContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Base64, percent-encoding e Unix Timestamp resolvem problemas diferentes. Eles costumam aparecer juntos em APIs e logs, mas confundir suas funções pode criar URLs quebradas, datas incorretas e uma falsa sensação de proteção.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Base64 representa bytes; não protege o conteúdo</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Base64 transforma bytes em um conjunto de caracteres ASCII. É útil em anexos, data URIs, cabeçalhos e trechos de tokens. Como a transformação é reversível e não exige segredo, <strong>Base64 não é criptografia</strong>. Qualquer pessoa que receba o valor pode decodificá-lo.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>O <a href="{$devToolsUrl}conversores/base64/">conversor Base64</a> trabalha com texto UTF-8, preservando acentos e emojis, e oferece o formato URL-safe, que troca <code>+</code> e <code>/</code> por <code>-</code> e <code>_</code> e pode remover o preenchimento final. Arquivos binários e imagens não são processados pela ferramenta; uma sequência decodificada que não forme UTF-8 válido é recusada em vez de produzir caracteres corrompidos.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>URL encoding protege a estrutura da URL</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Percent-encoding representa determinados caracteres como <code>%</code> seguido de dois dígitos hexadecimais. No modo de parâmetro, equivalente ao uso de <code>encodeURIComponent</code>, caracteres reservados são codificados para que um valor não seja confundido com separadores da query string. No modo de URL completa, equivalente a <code>encodeURI</code>, elementos estruturais como dois-pontos, barras, interrogação e <code>&amp;</code> são preservados.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Use o <a href="{$devToolsUrl}conversores/url-encode-decode/">codificador de URL</a> no modo parâmetro para valores individuais, como uma busca contendo espaços, acentos ou símbolos. Use o modo de URL completa apenas quando a estrutura já estiver montada. Nesta ferramenta, espaço vira <code>%20</code>; o sinal <code>+</code> não é transformado automaticamente em espaço ao decodificar, porque esse comportamento depende do contexto de formulário.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Unix Timestamp representa um instante</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Unix Timestamp conta o tempo desde 1º de janeiro de 1970 às 00:00:00 UTC. Algumas APIs usam segundos; JavaScript e vários sistemas usam milissegundos. Confundir as duas unidades desloca a data por uma escala de mil vezes.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>O <a href="{$devToolsUrl}conversores/unix-timestamp/">conversor Unix Timestamp</a> pode detectar a unidade ou usar a escolha explícita. Ele mostra UTC, horário local, ISO 8601 e tempo relativo, além de converter uma data de volta para segundos e milissegundos. O horário local depende da configuração do dispositivo; datas sem fuso explícito podem ser interpretadas localmente. Quando uma integração exige um instante inequívoco, prefira ISO 8601 com o sufixo <code>Z</code> para indicar UTC.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Exemplo de fluxo em uma API</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>Converta o timestamp do log para confirmar o horário real do evento.</li><li>Decodifique Base64 apenas quando souber que o conteúdo é texto e lembre que isso não valida autenticidade.</li><li>Codifique separadamente cada valor antes de montar uma query string.</li><li>Preserve o valor original para comparar com o resultado da ferramenta.</li></ol>
<!-- /wp:list -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}conversores/">Abrir todos os conversores</a></div><!-- /wp:button --></div>
<!-- /wp:buttons -->
HTML;

$generatorsContent = <<<HTML
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">GUID, senha e hash podem parecer apenas sequências aleatórias, mas têm objetivos bem diferentes. Usar cada um no lugar certo evita tratar um identificador público como segredo ou guardar uma senha com um algoritmo inadequado.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>GUID e UUID v4: identificadores, não segredos</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>GUID é o nome popular no ecossistema Microsoft; UUID é a nomenclatura mais ampla. O <a href="{$devToolsUrl}geradores/guid/">gerador de GUID</a> cria UUID versão 4 usando a API criptográfica do navegador. É possível escolher apresentação com ou sem hífens, maiúsculas, chaves e uma expressão pronta para <code>Guid.Parse</code> em C#.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Um UUID v4 é útil em fixtures, seeds, documentação e identificadores distribuídos. Ele não substitui uma senha, token secreto ou chave de API. Remover hífens ou trocar maiúsculas por minúsculas altera apenas a representação textual, não cria um tipo diferente de identificador.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Senhas precisam de aleatoriedade e armazenamento adequado</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>O <a href="{$devToolsUrl}geradores/senha/">gerador de senha</a> usa <code>crypto.getRandomValues</code> e rejeita valores que criariam viés na escolha de caracteres. O tamanho pode variar de 8 a 128 caracteres, com opções de letras, números, símbolos e remoção de caracteres visualmente ambíguos. Cada conjunto selecionado aparece ao menos uma vez.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>A senha existe apenas na tela e deve ser salva em um gerenciador de senhas confiável. A estimativa exibida considera tamanho e conjunto de caracteres; não avalia vazamentos, reutilização ou contexto da conta. A ferramenta também não deve ser usada para criar chaves criptográficas ou tokens de produção, que normalmente exigem formato e processo próprios.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Hash verifica integridade; não é codificação reversível</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Um hash transforma uma entrada em uma impressão digital de tamanho fixo. O mesmo texto gera o mesmo resultado, enquanto uma pequena alteração muda o hash. O <a href="{$devToolsUrl}geradores/hash/">gerador de hash</a> oferece SHA-256, SHA-384, SHA-512 e SHA-1 para compatibilidade, calculados sobre os bytes UTF-8 do texto.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>SHA-1 é vulnerável a colisões e não deve ser escolhido em projetos novos. Maiúsculas ou minúsculas no hexadecimal mudam apenas a apresentação. A ferramenta calcula hash de texto, não de arquivos, e limita a entrada a 500 mil caracteres.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Por que SHA simples não serve para armazenar senhas</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Algoritmos SHA foram projetados para serem rápidos. Essa característica facilita testar muitas tentativas por segundo quando um banco de hashes de senha é exposto. Sistemas de autenticação devem usar algoritmos específicos e configuráveis, como Argon2, scrypt ou bcrypt, com salt e parâmetros adequados. Gerar SHA-256 de uma senha não transforma o armazenamento em uma solução segura.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Resumo rápido</h2>
<!-- /wp:heading -->

<!-- wp:table -->
<figure class="wp-block-table"><table><thead><tr><th>Recurso</th><th>Use para</th><th>Não use como</th></tr></thead><tbody><tr><td>UUID v4</td><td>Identificadores e dados de teste</td><td>Senha ou token secreto</td></tr><tr><td>Senha aleatória</td><td>Credencial guardada em gerenciador</td><td>Chave criptográfica sem especificação</td></tr><tr><td>Hash SHA</td><td>Integridade e comparação</td><td>Armazenamento direto de senhas</td></tr></tbody></table></figure>
<!-- /wp:table -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{$devToolsUrl}geradores/">Abrir todos os geradores</a></div><!-- /wp:button --></div>
<!-- /wp:buttons -->
HTML;

$devArticles = [
    [
        'slug' => 'ferramentas-desenvolvedores-processamento-local-navegador',
        'title' => '8 ferramentas para desenvolvedores que processam tudo no navegador',
        'excerpt' => 'Conheça oito ferramentas de software para JSON, Regex, Base64, URL, Unix Timestamp, GUID, senhas e hashes, executadas localmente no navegador.',
        'content' => $devOverviewContent,
    ],
    [
        'slug' => 'como-validar-json-testar-regex-navegador',
        'title' => 'Como validar JSON e testar Regex com segurança no navegador',
        'excerpt' => 'Um guia prático para encontrar erros em JSON, entender flags e grupos de Regex e evitar diferenças entre mecanismos.',
        'content' => $jsonRegexContent,
    ],
    [
        'slug' => 'unix-timestamp-base64-url-encoding-guia-apis',
        'title' => 'Unix Timestamp, Base64 e URL Encoding: guia prático para APIs',
        'excerpt' => 'Entenda as diferenças entre Unix Timestamp, Base64 e percent-encoding e use cada conversão corretamente em APIs e logs.',
        'content' => $convertersContent,
    ],
    [
        'slug' => 'guid-senhas-hashes-quando-usar',
        'title' => 'GUID, senhas e hashes: o que cada gerador faz e quando usar',
        'excerpt' => 'Veja quando usar UUID v4, senhas aleatórias e hashes SHA, além dos erros de segurança que cada recurso não resolve.',
        'content' => $generatorsContent,
    ],
];

foreach ($devArticles as $devArticle) {
    $existingDevArticle = get_page_by_path($devArticle['slug'], OBJECT, 'post');
    $devArticleData = [
        'post_title' => $devArticle['title'],
        'post_name' => $devArticle['slug'],
        'post_status' => 'publish',
        'post_type' => 'post',
        'post_content' => $devArticle['content'],
        'post_excerpt' => $devArticle['excerpt'],
        'post_category' => [$softwareCategoryId],
    ];
    if ($existingDevArticle) {
        $devArticleData['ID'] = $existingDevArticle->ID;
        $devArticleId = wp_update_post($devArticleData, true);
    } else {
        $devArticleId = wp_insert_post($devArticleData, true);
    }
    if (is_wp_error($devArticleId)) {
        throw new RuntimeException($devArticleId->get_error_message());
    }
    echo "Artigo de software pronto: {$devArticleId} · {$devArticle['title']}.\n";
}

// Add one clear navigation entry and keep the current ordering intact.
$menu = wp_get_nav_menu_object('Home');
if ($menu) {
    $toolsUrl = get_permalink($toolsId);
    $alreadyLinked = false;
    foreach (wp_get_nav_menu_items($menu->term_id) ?: [] as $item) {
        if (untrailingslashit($item->url) === untrailingslashit($toolsUrl)) {
            $alreadyLinked = true;
            if ($item->title !== 'Ferramentas de Software') {
                $updatedMenuItem = wp_update_nav_menu_item($menu->term_id, $item->ID, [
                    'menu-item-title' => 'Ferramentas de Software',
                    'menu-item-url' => $toolsUrl,
                    'menu-item-status' => 'publish',
                    'menu-item-type' => 'custom',
                ]);
                if (is_wp_error($updatedMenuItem)) {
                    throw new RuntimeException($updatedMenuItem->get_error_message());
                }
                echo "Menu renomeado para Ferramentas de Software.\n";
            }
            break;
        }
    }
    if (!$alreadyLinked) {
        $menuItemId = wp_update_nav_menu_item($menu->term_id, 0, [
            'menu-item-title' => 'Ferramentas de Software',
            'menu-item-url' => $toolsUrl,
            'menu-item-status' => 'publish',
            'menu-item-type' => 'custom',
        ]);
        if (is_wp_error($menuItemId)) {
            throw new RuntimeException($menuItemId->get_error_message());
        }
        echo "Menu Ferramentas adicionado.\n";
    }
}

echo "Atualização WordPress concluída.\n";
