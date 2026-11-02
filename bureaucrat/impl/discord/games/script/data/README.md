# Official character data

`roles.json` and `nightsheet.json` come from The Pandemonium Institute's release repository,
`resources/data/` in <https://github.com/ThePandemoniumInstitute/botc-release>, under the
Community Created Content Policy. `roles.json` is trimmed to the fields the bot reads (id, name,
team, edition, the two night reminders); `nightsheet.json` is as published: the first-night and
other-night order by id, with `dusk`, `minioninfo`, `demoninfo` and `dawn` as markers.

Refresh both from the repository root:

```sh
curl -sL https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json \
  | bun -e 'const keep=["id","name","team","edition","firstNightReminder","otherNightReminder"];
    const r=await Bun.stdin.json();
    console.log(JSON.stringify(r.map(x=>Object.fromEntries(keep.filter(k=>x[k]).map(k=>[k,x[k]]))),null,1))' \
  > bureaucrat/impl/discord/games/script/data/roles.json
curl -sL https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/nightsheet.json \
  > bureaucrat/impl/discord/games/script/data/nightsheet.json
```
