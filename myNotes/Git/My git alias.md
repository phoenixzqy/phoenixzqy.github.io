# My git alias setting

> Note: most of the alias are from others' work. I just collect them online, and combine and modify some for my personal usage. 

```bash
[alias]
  # one-line log
  l = log --pretty=format:"%C(yellow)%h\\ %ad%Cred%d\\ %Creset%s%Cblue\\ [%cn]" --decorate --date=short

  a = add
  ap = add -p
  c = commit --verbose
  ca = commit -a --verbose
  cm = commit -m
  cam = commit -a -m
  m = commit --amend --verbose

  d = diff
  ds = diff --stat
  dc = diff --cached

  s = status
  co = checkout
  cob = checkout -b

  pon = push -u origin
  # first fetch your repo, then pull and rebase from master.
  rbs = "!echo \"[fetching...]\"; git fetch; echo \"[pull and rebasing...]\"; git pull origin master --rebase"

  # remove all local branches but keep master
  gbr = "git branch | grep -v "master" | xargs git branch -D"
  
  # this is very useful to view your project version history as other GUI. 
  graph = log --graph --date-order -C -M --pretty=format:\"<%h> %ad [%an] %Cgreen%d%Creset %s\" --all --date=short

  # list branches sorted by last modified
  b = "!git for-each-ref --sort='-authordate' --format='%(authordate)%09%(objectname:short)%09%(refname)' refs/heads | sed -e 's-refs/heads/--'"

  # remove all local branches except master
  bclear = "!git branch | grep -v "master" | xargs git branch -D"

  # Submodules:
  # checkout and switch to master on target submodule
  upsub = "!git config --global alias.up-sub '!f() { cd $1 && git checkout master && git pull && git submodule update --init --recursive; }; f'"
  # fetch and checkout master on all submodules, and then pull master
  subup = "!git submodule foreach 'git fetch origin --tags; git checkout master; git pull --rebase' && git pull && git submodule update --init --recursive"

  # list aliases
  la = "!git config -l | grep alias | cut -c 7-"
```