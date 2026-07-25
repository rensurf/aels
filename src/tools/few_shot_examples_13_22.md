# Additional Refined Few-shot Examples (13--22)

## Example 13 --- Already natural (don't rewrite)

**User** \> I knew you'd say that.

**Assistant**

``` json
{
  "message":"**自然です。そのままでOKです。**\n\n日常会話でとてもよく使われる表現です。\n\nより長く **I knew you were going to say that.** と言うこともできますが、会話では今の表現の方が自然です。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 14 --- Textbook vs conversational

**User** \> I want to confirm this.

**Assistant**

``` json
{
  "message":"**文法的には正しいですが、日常会話では少し硬く聞こえます。**\n\nネイティブなら **I just wanted to check...** や **I just wanted to make sure...** を使うことが多いです。\n\n**confirm** は仕事や正式な場面では自然です。",
  "phrases":[
    {
      "text":"I just wanted to check...",
      "japanese":"ちょっと確認したかったんだけど…",
      "note":"友達や同僚との会話で自然。",
      "verb_id":"check",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 15 --- Friend vs partner

**User** \> もうちょっと待ってて

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Hang on a little longer.** です。\n\n恋人なら **Just wait a little longer 😊** も自然です。\n\n**Please wait.** は少し事務的に聞こえます。",
  "phrases":[
    {
      "text":"Hang on a little longer.",
      "japanese":"もう少し待ってて。",
      "note":"親しい相手に自然。",
      "verb_id":"hang",
      "pattern":"V1",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 16 --- Software engineering

**User** \> 全部終わりました

**Assistant**

``` json
{
  "message":"**職場なら** **Everything's done.** が一番自然です。\n\nSlackなら **All done!** と短く言うこともよくあります。",
  "phrases":[
    {
      "text":"Everything's done.",
      "japanese":"全部終わりました。",
      "note":"Slackや口頭で自然。",
      "verb_id":"be",
      "pattern":"V2",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 17 --- Nuance

**User** \> thinking of と feel like の違い

**Assistant**

``` json
{
  "message":"**結論から言うと、意味が違います。**\n\n**I'm thinking of...** は『〜しようかなと考えている』。\n**I feel like...** は『今〜したい気分』です。\n\n予定なら **thinking of**、気分なら **feel like** が自然です。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 18 --- Australian everyday English

**User** \> カードで払えますか？

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Can I pay by card?** です。\n\nオーストラリアでも非常によく使われます。\n\n**Can I use my card?** も自然です。",
  "phrases":[
    {
      "text":"Can I pay by card?",
      "japanese":"カードで払えますか？",
      "note":"お店で最も自然。",
      "verb_id":"pay",
      "pattern":"V1",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 19 --- Grammar first

**User** \> continue to と continue -ing の違い

**Assistant**

``` json
{
  "message":"**結論から言うと、ほとんどの場合は意味の違いはありません。**\n\nどちらも自然です。\n\nただし、動詞によってはニュアンスが変わることがあるため、その場合だけ個別に覚えれば十分です。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 20 --- Literal vs natural

**User** \> 確認しておきます

**Assistant**

``` json
{
  "message":"**場面によって変わります。**\n\n友達や同僚なら **I'll check.** や **I'll make sure.** が自然です。\n\n**I'll confirm.** は仕事では自然ですが、日常会話では少し硬く聞こえます。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 21 --- Casual reaction

**User** \> それ俺に言ってる？笑

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Are you talking about me? 😂** です。\n\n冗談っぽく言うなら **Are you talking to me?** より自然です。",
  "phrases":[
    {
      "text":"Are you talking about me?",
      "japanese":"それ俺のこと？",
      "note":"冗談交じりに使える。",
      "verb_id":"talk",
      "pattern":"V1",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 22 --- Translation by intent

**User** \> 思ったより仕事長引いちゃった

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Work took longer than I expected.** です。\n\n今ちょうど終わったところなら **I ended up working longer than I expected.** も自然です。\n\n『長引く』を直訳するより、この言い方の方がネイティブらしく聞こえます。",
  "phrases":[]
}
```
