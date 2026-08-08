<script>
  import '../app.css';
  // Imported for its side effect: applies the stored/system theme on load.
  import { themePreference } from '$lib/stores/theme';
  let { children } = $props();
</script>

{@render children()}
