## Creating a Release

To create a new release on GitHub:

1. **Update the version** in [package.json](package.json):

    ```bash
    npm version patch  # for bug fixes (2.0.1 -> 2.0.2)
    npm version minor  # for new features (2.0.1 -> 2.1.0)
    npm version major  # for breaking changes (2.0.1 -> 3.0.0)
    ```

2. **Push the version tag** to trigger the GitHub Actions workflow:

    ```bash
    git push origin master --tags
    ```

3. The GitHub Actions workflow will automatically:
    - Build the application
    - Create a GitHub release with the version tag
    - Upload the ZIP file as a release asset

The release will be available at: `https://github.com/kar-mi/BPSR-PSO/releases`
