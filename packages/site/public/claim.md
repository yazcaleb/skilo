# Claim a skill

When you publish a skill anonymously, you get a claim token. Use it to take ownership later — no account needed at publish time.

## How it works

1. **Publish a skill.** When you run `skilo publish` without being logged in, you get an anonymous namespace and a claim token.
2. **Save the token.** The CLI saves it to `~/.skilo/claims/` automatically. You'll also see it in the terminal output.
3. **Log in and claim.** When you're ready to own the skill under your name, log in and run the claim command.

## Claim command

```
skilo claim @namespace/skill-name --token YOUR_TOKEN
```

Replace the namespace, skill name, and token with your values.

## First time?

Log in first to create your namespace:

```
skilo login your-name
```

After logging in, you can also publish directly under your namespace without the anonymous claim flow.
