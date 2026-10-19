"""Create the database cache table (settings.CACHES) as part of `migrate`.

Django's `createcachetable` isn't a migration, so it would otherwise be a separate
deploy step that's easy to forget. It's idempotent: an existing table is left alone.
"""

from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunPython(create_cache_table, migrations.RunPython.noop)]
