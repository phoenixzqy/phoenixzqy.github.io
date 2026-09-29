# Microsoft Teams notifications

zai can send automatic run-error notifications to both the operating
system and a private Microsoft Teams chat. Teams delivery is optional and uses
a Microsoft Teams Workflow webhook.

## Delivery behavior

When a repository's `notifications_enabled` setting is on:

- zai sends the native desktop notification supported by the current
  operating system;
- if Teams is configured, zai sends the same title, outcome, item
  description, and work-item or pull-request link to Teams; and
- failure of either channel is logged but does not fail or retry the completed
  agent run.

Poller-service runs notify only on failure, timeout, command-build error, or
process-start error. Successful and canceled runs stay quiet. Console
automations notify only on failure; successful and interrupted runs stay quiet.
The recurring housekeep service continues to notify only when a pass fails or
times out.

Cards for forge-backed runs include an **Open item** button. It opens the
original HTTPS URL supplied by the poller, including GitHub issues and pull
requests and Azure DevOps work items and pull requests. The explicit
`notifications teams test` card includes an **Open Microsoft instructions**
button to verify link handling. Housekeep, the setup-time connection check, and
console automations have no source forge item, so their cards have no link.

No polling or background notification loop is added. Delivery performs one
bounded request when a run reaches a terminal outcome.

## One-time setup

Run:

```text
zai notifications teams setup
```

Then configure Teams:

1. Open Microsoft Teams and open your chat with yourself.
2. Select **Workflows** and choose **Send webhook alerts to a chat**.
3. Authenticate, select your private self-chat, and add the workflow.
4. Edit the new workflow.
5. Expand **Attachments is null** -> **False** -> **For each**.
6. Open **Post card in a chat or channel** and set:
   - **Post as:** `Flow bot`
   - **Post in:** `Chat with Flow bot`
   - **Recipient:** your own Microsoft 365 account
   - **Adaptive Card:** select **Expression** and enter:

     ```text
     item()?['content']
     ```

7. Save the workflow and confirm that it is **Active**.
8. Copy its webhook URL and paste it into the waiting setup command.
9. Press Enter. The command tests the workflow before storing the URL.

The zai payload always contains an `attachments` array, so it uses the
False -> For each branch. The True branch handles other message-card payloads
supported by Microsoft's general template; configuring that branch is optional
for zai. If you keep it, use the same Flow bot destination rather than
Group chat.

The terminal deliberately hides the pasted webhook because the URL contains a
secret capability token. The prompt says that input is hidden, and after Enter
the command prints `Webhook URL received` before testing it.

## Commands

```text
zai notifications teams status
zai notifications teams test
zai notifications teams disable
```

`status` never prints the webhook URL. `disable` removes the local secret and
leaves native desktop notifications unchanged. `test` includes a clickable link
to the official Microsoft workflow documentation so it verifies both delivery
and Adaptive Card link handling.

For non-interactive setup, keep the webhook out of the process list and shell
history by passing it over standard input:

```text
printf '%s\n' "$TEAMS_WEBHOOK_URL" | zai notifications teams setup
```

## Secret storage

The webhook is stored at:

```text
~/.zai/secrets/teams.json
```

The directory and file use restricted user-only permissions where the operating
system supports POSIX permissions. The webhook is not stored in repository
config, printed by `config show` or `notifications teams status`, or exported in
a custom runtime package.

Do not paste the webhook into an issue, pull request, log, command argument, or
committed file. If it is exposed, delete or recreate the Teams Workflow and run
setup again with the replacement URL.

## Troubleshooting

### Nothing appears when I paste the webhook

This is intentional secret input behavior. Paste the URL and press Enter. The
command prints `Webhook URL received (input was hidden)` if input was captured.

### The workflow is suspended by organization data policy

Teams displays:

```text
Suspended: Workflow cannot run because it's blocked by your organization's data policy.
```

The webhook cannot bypass this tenant policy. A Microsoft 365 or Power Platform
administrator must allow the workflow or its connectors. Keep using native
desktop notifications if the policy cannot be changed.

### HTTP 400: Call made for a thread which is not a ChatThread

The generated template may configure:

```text
Post in: Group chat
Recipient: 48:notes
```

`48:notes` is Teams' self-chat identifier, not a valid group-chat thread. Edit
**Post card in a chat or channel** and use:

```text
Post as: Flow bot
Post in: Chat with Flow bot
Recipient: your own Microsoft 365 account
```

### HTTP 400 with no new run-history entry

Open the workflow's Details page and check **Status**. If it is **Off**, select
**Turn on** before retrying. Power Automate rejects an Off workflow at the
webhook boundary, so the CLI receives HTTP 400 and no failed run is recorded.
Editing the workflow can leave it Off even when both True and False branch
actions are configured correctly.

### Why did the workflow become Off when I did not turn it off?

If Teams previously showed **Suspended: Workflow cannot run because it's blocked
by your organization's data policy**, Power Automate turned the workflow off as
part of that policy enforcement. Correcting or saving the card actions does not
automatically restore the prior running state; turn the workflow on explicitly
after the policy allows it.

Power Automate can also disable long-running flows after sustained failures or
inactivity, but a newly created workflow that changed from **Suspended** to
**Off** during this setup most directly points to the earlier data-policy block.
If it turns itself off again after successful runs, check the workflow Details
and tenant policy with the Microsoft 365 or Power Platform administrator.

### Adaptive Card is required

After changing **Post in**, Power Automate may require the Adaptive Card field
again. Inside the existing **For each** block, set it with this expression:

```text
item()?['content']
```

Do not paste a fixed card. The expression forwards the card received in each
webhook request.

### HTTP 401 or 403

Copy a fresh URL from the workflow trigger and confirm that the trigger's
authentication policy permits the calling identity. Run setup again; never edit
or reconstruct the signed query string manually.

### HTTP 404 or 410

The saved webhook no longer exists. Recreate the workflow or copy its current
webhook URL and run setup again.

### Teams works but desktop notifications do not, or the reverse

The channels are attempted independently. Check the daemon or console log for a
`notify_error` entry. Confirm that `notifications_enabled` is on in the current
repository config and that Teams remains configured:

```text
zai config show
zai notifications teams status
```

### The card has no Open item button

Only notifications associated with a forge item have a URL. Setup tests,
housekeep runs, and console automations intentionally have no **Open item**
button. The explicit `notifications teams test` command instead includes
**Open Microsoft instructions**. A dev-service, review-service,
or pr-babysitter-service notification with a GitHub or Azure
DevOps item URL includes **Open item**.
