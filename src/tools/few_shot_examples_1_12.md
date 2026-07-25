# Refined Few-shot Examples (12)

## Example 1 --- Natural translation

**User** \> 久しく食べてない

**Assistant**

``` json
{
  "message": "**一番自然なのは**\n\n**I haven't had it in ages.**\n\n「もうかなり長いこと食べていない」という日常会話でとても自然な言い方です。\n\n**I haven't eaten it for a long time.** も文法的には正しいですが、少し教科書的です。\n\n**have** は食べ物・飲み物について会話でよく使われます。",
  "phrases":[
    {
      "text":"I haven't had it in ages.",
      "japanese":"久しく食べていない。",
      "note":"長い間食べていない時の自然な会話表現。",
      "verb_id":"have",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 2 --- Already natural

**User** \> I get sleepy when I get drunk.

**Assistant**

``` json
{
  "message":"**自然です。そのままでOKです。**\n\nただ、単に『お酒を飲むと眠くなる』という体質を言うなら **I get sleepy when I drink.** の方が自然なこともあります。\n\n**get drunk** は『酔う』という状態を強調します。",
  "phrases":[
    {
      "text":"I get sleepy when I drink.",
      "japanese":"お酒を飲むと眠くなる。",
      "note":"飲酒全般について話す時に自然。",
      "verb_id":"get",
      "pattern":"V2",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 3 --- Understandable but unnatural

**User** \> Just imitating you.

**Assistant**

``` json
{
  "message":"**意味は通じますが、この場面では少し不自然です。**\n\nネイティブなら **I'm just copying you.** と言うことがほとんどです。\n\n**imitate** は『ものまねする』、**copy** は『相手と同じことをする』という違いがあります。",
  "phrases":[
    {
      "text":"I'm just copying you.",
      "japanese":"君の真似をしてるだけ。",
      "note":"友達同士で一番自然。",
      "verb_id":"copy",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 4 --- Wrong collocation

**User** \> She didn't speak anything.

**Assistant**

``` json
{
  "message":"**この場合は不自然です。**\n\n自然なのは **She didn't say anything.** です。\n\n**say** は『何を言ったか』、**speak** は『話すという行為』に焦点があります。そのため **speak anything** は通常言いません。",
  "phrases":[
    {
      "text":"She didn't say anything.",
      "japanese":"彼女は何も言わなかった。",
      "note":"発言内容には通常 say を使う。",
      "verb_id":"say",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 5 --- Nuance comparison

**User** \> I expect that you'll be on time tomorrow と I expect you to
be on time tomorrow の違い

**Assistant**

``` json
{
  "message":"**完全に同じではありません。**\n\n**I expect that you'll...** は予測に近い言い方です。\n\n**I expect you to...** は相手への期待・要求が含まれるため、少し強く聞こえることがあります。\n\n友達なら **Try to be on time tomorrow.** の方が柔らかいです。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 6 --- Grammar

**User** \> Only a few old buildings remain. 倒置にしなくていい？

**Assistant**

``` json
{
  "message":"**倒置にする必要はありません。**\n\n**Only** はここでは主語の名詞句を修飾しています。\n\n倒置は **Only then did I realise...** のように、副詞表現が文頭に来る場合に起こります。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 7 --- Hear vs could hear

**User** \> I couldn't hear you は急に話しかけられた時でも使える？

**Assistant**

``` json
{
  "message":"**状況によります。**\n\n話しかけられたこと自体に気づかなかったなら **I didn't hear you.** の方が自然です。\n\n**I couldn't hear you.** は『聞こうとしたけど聞こえなかった』というニュアンスです。",
  "phrases":[
    {
      "text":"Sorry, I didn't hear you.",
      "japanese":"ごめん、聞こえてなかった。",
      "note":"話しかけられたこと自体に気づかなかった時。",
      "verb_id":"hear",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 8 --- Context matters

**User** \> どこで待ってればいい？

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Where should I wait for you?** です。\n\n相手を待つことが分かっているなら **for you** を付けると自然です。\n\n場所だけを聞くなら **Where should I wait?** でも大丈夫です。",
  "phrases":[
    {
      "text":"Where should I wait for you?",
      "japanese":"どこで待ってればいい？",
      "note":"待ち合わせ場所を聞く時。",
      "verb_id":"wait",
      "pattern":"V1",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 9 --- the one vs what

**User** \> それって前俺に言ってたやつ？

**Assistant**

``` json
{
  "message":"**一番自然なのは** **Is that the one you told me about before?** です。\n\n特定の物や場所を指すなら **the one** が自然です。\n\n内容そのものを指すなら **Is that what you told me about before?** が合います。",
  "phrases":[]
}
```

------------------------------------------------------------------------

## Example 10 --- Workplace English

**User** \> Is there any document saying how to register job config

**Assistant**

``` json
{
  "message":"**意味は通じますが、少し不自然です。**\n\n自然なのは **Is there any documentation on how to register a job config?** です。\n\n技術文書では **documentation** の方が一般的です。",
  "phrases":[
    {
      "text":"Is there any documentation on how to register a job config?",
      "japanese":"ジョブ設定の登録方法についてのドキュメントはありますか？",
      "note":"職場で自然。",
      "verb_id":"be",
      "pattern":"V2",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 11 --- Translation by intent

**User** \> 絶対それ言うと思った笑

**Assistant**

``` json
{
  "message":"**一番自然なのは** **I knew you'd say that. 😂** です。\n\n**I knew you were going to say that.** も自然ですが、会話では前者の方が短く自然です。\n\n**I thought you would definitely say that.** は少し直訳っぽく聞こえます。",
  "phrases":[
    {
      "text":"I knew you'd say that.",
      "japanese":"絶対それ言うと思った。",
      "note":"予想どおりだった時の定番表現。",
      "verb_id":"know",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```

------------------------------------------------------------------------

## Example 12 --- Lifestyle nuance

**User** \> 誰かといるより1人でいる方が好き

**Assistant**

``` json
{
  "message":"**一番自然なのは** **I usually prefer being on my own.** です。\n\n**I prefer being alone to being with other people.** も正しいですが、少し説明的です。\n\n**on my own** は『一人の時間が好き』という柔らかいニュアンスになります。",
  "phrases":[
    {
      "text":"I usually prefer being on my own.",
      "japanese":"普段は一人でいる方が好き。",
      "note":"一人の時間を好むことを自然に伝える。",
      "verb_id":"prefer",
      "pattern":"V3",
      "register":"informal"
    }
  ]
}
```
