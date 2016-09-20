# -*- coding: utf-8 -*-
# Generated by Django 1.9.9 on 2016-09-12 18:43
from __future__ import unicode_literals

import json
from django.db import migrations


def show_na_legend(apps, schema_editor):
    Visual = apps.get_model("summary", "Visual")
    rob_types = [2, 3]
    for obj in Visual.objects.filter(visual_type__in=rob_types):
        try:
            settings = json.loads(obj.settings)
        except ValueError:
            settings = False

        if settings:
            settings['show_na_legend'] = True
            obj.settings = json.dumps(settings)

            # don't change last_updated timestamp
            Visual.objects\
                .filter(id=obj.id)\
                .update(settings=obj.settings)


def hide_na_legend(apps, schema_editor):
    Visual = apps.get_model("summary", "Visual")
    rob_types = [2, 3]
    for obj in Visual.objects.filter(visual_type__in=rob_types):
        try:
            settings = json.loads(obj.settings)
        except ValueError:
            settings = False

            if settings:
                settings.pop('show_na_legend')
                obj.settings = json.dumps(settings)

                # don't change last_updated timestamp
                Visual.objects\
                    .filter(id=obj.id)\
                    .update(settings=obj.settings)


class Migration(migrations.Migration):

    dependencies = [
        ('summary', '0010_add_nr_option'),
    ]

    operations = [
        migrations.RunPython(show_na_legend, reverse_code=hide_na_legend),
    ]