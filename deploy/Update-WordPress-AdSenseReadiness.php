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
    'post_title' => 'Ferramentas do HomeForge Lab',
    'post_name' => 'ferramentas-homeforge',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => $toolsContent,
    'post_excerpt' => 'Ferramentas criadas pelo HomeForge Lab, incluindo o PauseCut para pré-edição local de vídeos.',
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

// Add one clear navigation entry and keep the current ordering intact.
$menu = wp_get_nav_menu_object('Home');
if ($menu) {
    $toolsUrl = get_permalink($toolsId);
    $alreadyLinked = false;
    foreach (wp_get_nav_menu_items($menu->term_id) ?: [] as $item) {
        if (untrailingslashit($item->url) === untrailingslashit($toolsUrl)) {
            $alreadyLinked = true;
            break;
        }
    }
    if (!$alreadyLinked) {
        $menuItemId = wp_update_nav_menu_item($menu->term_id, 0, [
            'menu-item-title' => 'Ferramentas',
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
