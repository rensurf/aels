infrastructure/terraform/ 配下で以下を実行してください。

1. `terraform init` を各モジュールディレクトリで実行（未初期化の場合）
2. AWS モジュール (`modules/aws/`) と Azure モジュール (`modules/azure/`) それぞれに対して `terraform plan` を実行
3. 以下の観点でプランの内容を確認・報告してください：
   - 意図しないリソースの **削除（destroy）** がないか
   - 意図しないリソースの **変更（update in-place / replace）** がないか
   - 新規作成（add）の内容が想定通りか
4. 問題があれば原因と修正案を提示してください。問題がなければ「apply 可能」と判断して報告してください。

作業ディレクトリ: `infrastructure/terraform/`
