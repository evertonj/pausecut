# PauseCut: preparação para a análise do AdSense

O pacote inclui o editor, três guias próprios sobre seu uso, perguntas frequentes, Sobre, Contato, Privacidade e Termos. Todas as páginas são HTML estático, acessíveis sem executar o motor de vídeo. Há navegação, títulos, descrições, URLs canônicas e um sitemap em `https://pausecut.homeforgelab.com/sitemap.xml`.

**A aprovação pertence ao Google.** Essas mudanças preparam a estrutura, mas não certificam conformidade, não garantem aprovação e não substituem a análise do domínio publicado. Não há uma quantidade de artigos, palavras ou acessos que este pacote prometa como garantia. Revise os textos para representar a operação real do seu site.

## 1. Confirmar as informações reais

Edite `browser-app/site.config.json`:

- `responsibleName`: nome real do responsável ou razão social que deve aparecer publicamente.
- `contactEmail`: caixa de e-mail pública existente e acompanhada pelo responsável. Teste envio e recebimento.
- `adsensePublisherId`: seu ID de conta no formato `ca-pub-` seguido de 16 números. Pode ficar vazio enquanto você não tiver uma conta.
- `baseUrl`: endereço final do editor, com HTTPS e barra final. Atualmente `https://pausecut.homeforgelab.com/`.
- `adsenseSiteDomain`: domínio cadastrado no AdSense. Atualmente `homeforgelab.com`, mesmo com o editor no subdomínio.
- `updatedAt`: data da revisão dos termos e da política, em ano-mês-dia.

Não invente um e-mail apenas para preencher a página. Enquanto nome/e-mail estiverem vazios, o build avisa que a versão está pendente e a página Contato informa que o canal não foi configurado. **Não solicite análise com essa pendência.**

Para gerar uma versão que exija os dados de contato:

```powershell
./deploy/Build-SharedHosting.ps1 -Ready
```

O parâmetro `-NodePath` pode apontar para o Node instalado na máquina. Sem `-Ready`, é possível gerar uma versão de preparação. O projeto não publica no Google nem na Hostinger por esse comando.

## 2. Publicar e integrar ao site principal

Use **PauseCut-Hostinger-Subdominio.zip** e as instruções de `PUBLICAR-HOSTINGER-COMPARTILHADA.md`. Extraia o pacote diretamente na pasta raiz atribuída a `pausecut.homeforgelab.com`. Não substitua o WordPress do domínio principal.

Na navegação do site principal, inclua um link para o editor e seus guias. Confira a qualidade e a utilidade das demais páginas públicas do domínio. O cadastro do AdSense é de **`homeforgelab.com`**. O subdomínio **`pausecut.homeforgelab.com`** não é cadastrado para uma aprovação independente. Preparar o editor não corrige problemas existentes no resto do site.

As páginas precisam abrir publicamente por HTTPS, sem login ou bloqueio ao rastreador. Confira as regras de `robots.txt` de cada hostname, a segurança da hospedagem e possíveis regras herdadas do WordPress caso o subdomínio aponte para uma pasta dele. Não substitua configurações existentes do domínio principal sem revisar as regras necessárias ao restante do site.

Você pode enviar o sitemap do editor ao Search Console em uma propriedade que cubra o subdomínio. Isso ajuda a descoberta das páginas; não é uma garantia nem um requisito isolado de aprovação no AdSense.

## 3. Verificar a propriedade da conta

Depois de preencher um ID válido, o build inclui a meta tag `google-adsense-account` no HEAD das páginas do editor. Também gera:

- `artifacts/adsense-integration/verificacao-adsense.html`: contém a meta tag para copiar para o HEAD da página inicial do domínio. No WordPress, use um recurso apropriado de inserção no HEAD. Não publique esse arquivo como uma nova página inicial.
- `artifacts/adsense-integration/ads.txt`: contém a linha da conta para configurar na raiz.
- `artifacts/adsense-integration/STATUS.json`: informa pendências de contato e se há conta configurada.

Esses materiais permanecem somente em **`artifacts/adsense-integration`**, fora do ZIP público. Eles são para instalação manual no domínio principal; extrair o ZIP no subdomínio não altera o WordPress nem o ads.txt de `homeforgelab.com`. Se o ID estiver vazio, os arquivos de meta tag e ads.txt não são criados; não há identificador fictício no pacote. Mantê-los fora da raiz pública evita expor documentação operacional e arquivos de estado como páginas do site.

No painel AdSense, adicione o domínio e escolha a opção de verificação compatível com o que você publicou. Se escolher meta tag, confira a tag no HEAD da página inicial do domínio. Siga a instrução exibida pela sua conta e, depois de validar a propriedade, solicite a análise. A configuração do pacote não solicita a análise por você.

## 4. Colocar ads.txt na raiz correta

Para a mesma conta e os mesmos vendedores no domínio principal e no editor, o endereço é **`https://homeforgelab.com/ads.txt`**, correspondente à raiz do site principal. Colocar um arquivo apenas em `pausecut.homeforgelab.com` não substitui essa configuração.

Se futuramente o subdomínio usar vendedores ou uma conta diferentes, siga a orientação do Google para ads.txt de subdomínios: referencie `subdomain=pausecut.homeforgelab.com` no ads.txt do domínio principal e configure o arquivo do subdomínio. Essa referência só é necessária quando os vendedores ou IDs são diferentes; não é gerada automaticamente pelo pacote.

Se já houver um arquivo ou um plugin que gere ads.txt, adicione a linha da sua conta preservando as linhas legítimas existentes. Não sobrescreva entradas de outras redes ou contas utilizadas pelo site. Use o texto gerado com seu ID real e confirme que a URL retorna texto com status HTTP 200.

O Google recomenda ads.txt, mas a existência do arquivo não garante aprovação. A atualização de status no painel pode levar alguns dias.

## 5. Consentimento e ativação dos anúncios

**Esta versão não carrega o JavaScript de anúncios, não cria blocos de publicidade e não dispara pedidos de anúncios.** A identificação da conta usa meta tag. Isso permite preparar a análise sem implantar um banner genérico que fingiria substituir a plataforma de consentimento do AdSense.

O modo de CPU paralelo usa isolamento de origem, com os headers COOP/COEP na raiz do editor. Esses headers impõem condições ao carregamento de recursos externos. Confira a integração real dos scripts e iframes de publicidade antes de ativá-los. Se for necessário retirar o isolamento para a integração escolhida, o editor mantém o modo compatível de uma thread. O pacote não promete compatibilidade automática entre o isolamento e qualquer configuração de anúncios.

Antes de ativar publicidade:

1. No AdSense, configure **Privacidade e mensagens**, incluindo a solução adequada de consentimento. Para veicular anúncios a visitantes do EEE, Reino Unido e Suíça, use uma CMP certificada pelo Google e integrada ao TCF. A solução do próprio Google é uma opção disponível no serviço.
2. Revise como a publicidade já está configurada no WordPress: scripts globais podem afetar o domínio e precisam de suas próprias escolhas de privacidade. O pacote não desativa nem configura plugins externos.
3. Atualize a política para descrever os fornecedores efetivamente ativos, o contato responsável e as práticas reais de retenção dos registros e mensagens. A seção atual informa que os anúncios ainda não estão ativos no editor.
4. Só após o status adequado no painel e a configuração de privacidade, integre os códigos reais de anúncios seguindo as instruções do AdSense.
5. Prefira anúncios em páginas com conteúdo editorial útil. Revise manualmente qualquer colocação automática. Mantenha anúncios identificados como publicidade e afastados de Selecionar arquivo, Analisar, Exportar, Baixar, da prévia e da lista de cortes. Não solicite cliques nem use anúncios que pareçam botões de download.
6. Evite anunciar em telas de erro, espera, contato ou políticas que existam apenas para uma função auxiliar. Um estado vazio do editor não deve virar uma tela dominada por anúncios.

A política informa que o vídeo não é enviado ao servidor do editor. Não confunda isso com ausência de dados de acesso ou de publicidade: a hospedagem recebe requisições das páginas e o Google poderá tratar dados de publicidade quando você ativar anúncios. Não inclua nomes dos arquivos ou conteúdo dos vídeos em medição de audiência ou eventos de anúncios.

## Conferência antes de solicitar a análise

- Contato real configurado e funcionando; nome do responsável confirmado.
- Guias lidos e revisados pelo responsável, sem afirmações que não correspondam à ferramenta.
- Política consistente com os serviços efetivamente ativos, inclusive no WordPress.
- Editor, guias, navegação e arquivos JS/WASM acessíveis no domínio publicado.
- Página inicial do domínio útil, sem conteúdo vazio, duplicado ou de manutenção.
- Verificação de propriedade concluída no painel; conta com dados corretos.
- ads.txt correto na raiz, quando utilizado.
- Consentimento preparado antes de veicular publicidade.

As verificações locais deste pacote conferem os links internos, metadados, sitemap e a geração de identificação da conta. Não verificam sua conta AdSense, caixa de e-mail, configurações do WordPress, ambiente publicado ou aprovação do Google.

## Referências oficiais consultadas

- [Páginas prontas para o AdSense: conteúdo e navegação](https://support.google.com/adsense/answer/7299563?hl=pt-BR).
- [Verificar a propriedade e adicionar um site](https://support.google.com/adsense/answer/12169212?hl=en).
- [Sites aceitos no cadastro: domínio e gerenciamento](https://support.google.com/adsense/answer/12170421?hl=en).
- [Informações de publicidade exigidas na privacidade](https://support.google.com/adsense/answer/1348695?hl=pt-BR).
- [Guia ads.txt](https://support.google.com/adsense/answer/12171612?hl=en-GB).
- [ads.txt em subdomínios](https://support.google.com/adsense/answer/9785052?hl=en).
- [Requisitos de CMP para editores](https://support.google.com/adsense/answer/13554116?hl=en-GB).
- [Anúncios em telas sem conteúdo do editor](https://support.google.com/publisherpolicies/answer/11112688?hl=en).

Consulta em 16/09/2026. Confira o painel e as políticas vigentes antes da ativação.
