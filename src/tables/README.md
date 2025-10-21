## Configuration

### Updating Skill Names

The skill names are stored in `src/tables/skill_names.json`. If you need to update skill names:

1. **Edit the file**: Make your changes to `src/tables/skill_names.json`
2. **Save the file**
3. **Reload the configuration**: Send a POST request to reload the skill names without restarting:

    ```bash
    # Using curl (Windows PowerShell)
    Invoke-WebRequest -Uri "http://localhost:8990/api/reload-skills" -Method POST

    # Using curl (Git Bash or WSL)
    curl -X POST http://localhost:8990/api/reload-skills
    ```

    You should see a response like:

    ```json
    {
        "code": 0,
        "msg": "Skill names reloaded successfully"
    }
    ```

4. **Verify**: The server logs will show `✓ Skill names reloaded successfully`

The updated skill names will now be visible in the overlay without needing to restart the application.
