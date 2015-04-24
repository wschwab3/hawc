# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations


class Migration(migrations.Migration):

    dependencies = [
        ('animal', '0036_animalgroup_animal_source'),
    ]

    operations = [
        migrations.RenameField(
              model_name='endpoint',
              old_name='NOAEL',
              new_name='NOEL',
        ),
        migrations.RenameField(
              model_name='endpoint',
              old_name='LOAEL',
              new_name='LOEL',
        ),
        migrations.AlterField(
            model_name='endpoint',
            name='NOEL',
            field=models.SmallIntegerField(default=-999, help_text=b'No observed effect level', verbose_name=b'NOEL'),
            preserve_default=True,
        ),
        migrations.AlterField(
            model_name='endpoint',
            name='LOEL',
            field=models.SmallIntegerField(default=-999, help_text=b'Lowest observed effect level', verbose_name=b'LOEL'),
            preserve_default=True,
        )
    ]
