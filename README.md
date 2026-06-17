# 近所価格メモ

家の周辺にあるスーパーやドラッグストアで、よく買う商品の価格を記録・比較するためのシンプルなWebアプリです。

## 主な機能

- 共有グループ：京都の生活、三重の実家など、生活圏・共有相手ごとにデータを分離
- 商品登録：商品名、カテゴリ、内容量・容量を登録
- 店舗登録：店舗名、スーパー・ドラッグストアなどの区分を登録
- 価格登録：通常価格、任意のセール価格、セール期間、記録日、メモを保存
- 価格比較：商品ごとに店舗別の最新価格を比較し、現在・通常価格・セール価格の最安値を表示
- 価格履歴：商品ごとの価格記録を日付順で確認
- セール分析：差額、割引率、セール中表示
- ダッシュボード：現在の最安値、最安値店舗、過去最安値、平均との差、最近の価格推移を表示
- 商品検索：商品名、カテゴリ、内容量で絞り込み

## 技術構成

- React
- TypeScript
- Vite
- 通常のCSS
- Supabase Authentication
- Supabase Database / Realtime / Storage

## セットアップ

```bash
pnpm install
pnpm dev
```

ブラウザで表示されたURLを開いてください。通常は `http://localhost:5173/price-memo-app/` です。

## iPhoneでローカル開発版を見る

MacとiPhoneを同じWi-Fiにつないだうえで、Mac側で以下を実行します。

```bash
pnpm dev:host
```

表示された `Network` のURLをiPhoneのSafariで開いてください。

```text
http://MacのIPアドレス:5173/price-memo-app/
```

iPhoneで `localhost` を開くと、MacではなくiPhone自身を見に行くため、ローカル開発中のアプリには接続できません。

## Supabaseセットアップ

1. SupabaseのSQL Editorで [supabase/schema.sql](supabase/schema.sql) を実行します。
2. `.env.example` を参考に `.env` を作成します。

```bash
VITE_SUPABASE_URL=https://shhvdacygqxlzvqqagkk.supabase.co
VITE_SUPABASE_ANON_KEY=Supabaseのanon key
```

3. GitHub Pagesで公開する場合は、GitHubリポジトリの `Settings > Secrets and variables > Actions` に以下を登録します。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

anon keyは公開フロントエンドで使う前提のキーですが、リポジトリには直接コミットしないでください。データ保護はSupabaseのRLSで行います。

`.env` を作成・変更した後は、開発サーバーを一度止めてから再起動してください。

## ビルド

```bash
pnpm build
```

## 家族と共有する

GitHub Pagesで公開すると、家族のスマホやPCから以下のURLで開けます。

```text
https://taniguchishunshun.github.io/price-memo-app/
```

`main` ブランチへpushすると、GitHub Actionsが自動でビルドしてGitHub Pagesへ反映します。

GitHub側では、リポジトリの `Settings > Pages` で `Build and deployment` の `Source` を `GitHub Actions` にしてください。

Supabase側では、`Authentication > URL Configuration` に以下を設定してください。

```text
Site URL:
https://taniguchishunshun.github.io/price-memo-app/

Redirect URLs:
https://taniguchishunshun.github.io/price-memo-app/
http://localhost:5173/price-memo-app/
http://127.0.0.1:5173/price-memo-app/
```

## iPhoneでアプリのように使う

1. iPhoneのSafariで公開URLを開きます。
2. 共有ボタンを押します。
3. 「ホーム画面に追加」を選びます。
4. ホーム画面の「価格メモ」アイコンから開きます。

データはSupabaseに保存されます。同じ共有グループに参加している家族やパートナーの端末へ同期されます。

## 共有グループとエリア

アプリ上部の「共有グループ」で、生活圏ごとのデータを切り替えられます。

- 京都の生活：京都市の店舗や価格を記録
- 三重の実家：三重県の店舗や価格を記録

「共有」画面から、新しいグループを追加できます。商品・店舗・価格記録は選択中のグループに保存されるため、彼女と使う京都のデータ、実家の家族に渡す三重のデータを分けて管理できます。

グループごとに商品・店舗・価格記録が分かれます。「京都の生活」をパートナーと共有し、「三重の実家」を家族と共有するように使えます。

## データを失わないためのバックアップ

アプリ内の「保存」画面から、登録データをJSONファイルとしてダウンロードできます。

- 「バックアップをダウンロード」：商品・店舗・価格記録をファイルに保存
- 「バックアップから復元」：保存したJSONファイルからデータを復元

長期利用する場合でもデータはSupabaseに保存されます。大きく入力した後にバックアップを作成しておくと、手元にも控えを残せます。

## 使い方

1. 「商品」から、牛乳 1000ml、卵 10個、米 5kg などを登録します。
2. 「店舗」から、よく行くスーパーやドラッグストアを登録します。
3. 「価格登録」で、商品・店舗・通常価格・セール価格などを入力します。
4. 「比較」で、商品ごとの店舗別価格と最安値を確認します。
5. 「履歴」で、過去の価格記録やセール時の割引率を確認します。
6. 「ホーム」で、商品ごとの価格状況をざっと確認します。
7. 「共有」で、京都・三重などの生活圏グループを追加・切り替えます。
8. 「保存」で、バックアップのダウンロードや復元を行います。

## データ保存について

入力したデータはSupabaseに保存されます。ブラウザを閉じても、別の端末でログインしてもデータを確認できます。

ログイン情報はブラウザに保存されます。共有端末では使い終わったあとにログアウトしてください。
