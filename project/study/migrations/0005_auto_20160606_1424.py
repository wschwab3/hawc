# -*- coding: utf-8 -*-
# Generated by Django 1.9.4 on 2016-06-06 19:24


from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('study', '0004_auto_20160407_1010'),
    ]

    operations = [
        migrations.AlterField(
            model_name='study',
            name='published',
            field=models.BooleanField(default=False, help_text=b'If True, this study, Study Evaluation, and extraction details may be visible to reviewers and/or the general public (if assessment-permissions allow this level of visibility). Team-members and project-management can view both published and unpublished studies.'),
        ),
    ]
