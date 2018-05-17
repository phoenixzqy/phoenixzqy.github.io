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
  rbs = "!echo \"\\033[32m[fetching...]\\033[0m\"; git fetch; echo \"\\033[32m[pull and rebasing...]\\033[0m\"; git pull origin master --rebase"
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

  # cozstay alias
  rbd = rebase origin/develop
  cod = checkout origin/develop
  coznb = "!f() { \
      if [ -z $1 ]; then \
          echo ERROR: No Branch Name Supplied; \
                                                  else \
                                                          git fetch && git checkout origin/develop && git checkout -b $1; \
      fi; \
  }; f"

  lac = "!f()\
  {\
          echo '# cozstay alias';\
          echo 'rbd = rebase origin/develop';\
          echo 'cod = checkout origin/develop';\
          echo 'cob = checkout -b <your_new_branch_name>';\
          echo 'pon = push -u origin <origin_new_branch_name>';\
          echo 'coznb = git fetch && git checkout origin/develop && git checkout -b <your_new_branch_name>';\
  }; f"
  up-sub = "!f() { cd $1 && git checkout master && git pull && git submodule update --init --recursive; }; f"
```