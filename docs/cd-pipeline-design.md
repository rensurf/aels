# CD Pipeline 設計書

## 目標

`main` ブランチへの push 時に、CI（lint・型チェック・テスト）が通ったら自動で AWS Lambda 3関数をデプロイする。

---

## デプロイ対象

| Lambda 関数名 | ハンドラー | ソース |
|---|---|---|
| `aels-teacher` | `main.lambda_handler` | `src/` 全体 |
| `aels-worker` | `worker.worker_handler` | `src/` 全体 |
| `aels-quiz-scheduler` | `main.quiz_scheduler_handler` | `src/` 全体 |

3関数とも同じコードベース（`src/`）から動くため、zip は1つ作って3関数に流す。

---

## 認証方式：AWS OIDC（推奨）

GitHub Actions から AWS に接続する方法は2つある。

| 方法 | 仕組み | 問題点 |
|---|---|---|
| IAM User + アクセスキー | GitHub Secrets に `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を保存 | 長期クレデンシャルがシークレットに残り続ける。漏洩リスク |
| **OIDC（推奨）** | GitHub が一時トークンを発行し、AWS が検証して一時クレデンシャルを渡す | シークレットにキーを保存しない。ジョブ終了後トークン失効 |

### OIDC の仕組み（面接で説明できる形）

```
GitHub Actions
  │
  │ 1. "このリポジトリのmainブランチで動いてます" という署名付きトークンを発行
  ▼
AWS STS (Security Token Service)
  │
  │ 2. GitHub の公開鍵でトークンを検証
  │ 3. IAM Role の信頼ポリシーと照合（このリポジトリからのみ許可）
  │ 4. 一時クレデンシャル（15分〜1時間）を返す
  ▼
GitHub Actions
  │
  │ 5. 一時クレデンシャルで Lambda を更新
  ▼
AWS Lambda
```

---

## 必要な作業

### 1. Terraform：OIDC プロバイダーと IAM Role の追加

`infrastructure/terraform/modules/aws/` に新ファイル `github_oidc.tf` を追加する。

```hcl
# GitHub OIDC プロバイダー（AWSアカウントに1つだけ登録）
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub の OIDC エンドポイントの thumbprint
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# GitHub Actions が assume できる IAM Role
resource "aws_iam_role" "github_actions_deploy" {
  name = "aels-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # ren-surf/aels リポジトリの main ブランチからのみ許可
          "token.actions.githubusercontent.com:sub" = "repo:ren-surf/aels:ref:refs/heads/main"
        }
      }
    }]
  })
}

# Lambda の更新に必要な最小権限
resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "aels-github-actions-deploy-policy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
      ]
      Resource = [
        "arn:aws:lambda:ap-southeast-2:*:function:aels-teacher",
        "arn:aws:lambda:ap-southeast-2:*:function:aels-worker",
        "arn:aws:lambda:ap-southeast-2:*:function:aels-quiz-scheduler",
      ]
    }]
  })
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
```

### 2. GitHub Actions：CD ジョブの追加

既存の `ci.yml` に `deploy` ジョブを追加する（CIが成功した場合のみ、`main` ブランチで実行）。

```yaml
deploy:
  needs: ci                          # CI ジョブが成功した場合のみ実行
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest

  permissions:
    id-token: write   # OIDC トークン発行に必要
    contents: read

  steps:
    - uses: actions/checkout@v4

    - uses: astral-sh/setup-uv@v5
      with:
        python-version: "3.12"

    - name: Build deployment package
      run: |
        # 依存ライブラリをパッケージに同梱（Lambda には venv がないため）
        uv pip install -r requirements.txt --target package/
        cp -r src/ package/
        cd package && zip -r ../deploy.zip . -x "*.pyc" -x "__pycache__/*"

    - name: Configure AWS credentials (OIDC)
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
        aws-region: ap-southeast-2

    - name: Deploy to Lambda
      run: |
        aws lambda update-function-code \
          --function-name aels-teacher \
          --zip-file fileb://deploy.zip

        aws lambda update-function-code \
          --function-name aels-worker \
          --zip-file fileb://deploy.zip

        aws lambda update-function-code \
          --function-name aels-quiz-scheduler \
          --zip-file fileb://deploy.zip
```

### 3. GitHub Secrets の設定

| シークレット名 | 値 | 設定場所 |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output github_actions_role_arn` の出力値 | GitHub → Settings → Secrets |

---

## 実装手順

```
1. Terraform に github_oidc.tf を追加
2. terraform apply でリソースを作成
3. terraform output github_actions_role_arn でARNを取得
4. GitHub Secrets に AWS_DEPLOY_ROLE_ARN を登録
5. ci.yml に deploy ジョブを追加
6. main に push して動作確認
```

---

## デプロイフロー（完成後）

```
git push origin main
      │
      ▼
GitHub Actions: CI ジョブ
  - lint (ruff)
  - type check (mypy)
  - test (pytest)
      │ 全部 pass
      ▼
GitHub Actions: deploy ジョブ
  - src/ + 依存ライブラリを deploy.zip にパッケージング
  - OIDC で AWS 一時クレデンシャルを取得
  - 3つの Lambda に deploy.zip をアップロード
      │
      ▼
AWS Lambda 更新完了（約1〜2分）
```

---

## なぜ IAM User + アクセスキーではなく OIDC か（面接回答用）

> 「長期クレデンシャルをGitHubに保存したくなかったためです。OIDCを使うと、AWSがGitHubのトークンを検証して一時クレデンシャルを発行するので、アクセスキーがどこにも保存されません。最小権限の原則に従い、デプロイロールには lambda:UpdateFunctionCode のみを付与しています。」
